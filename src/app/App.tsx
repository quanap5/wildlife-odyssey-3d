/** Application shell: boots the world, then switches between menu and expedition. */
import { useEffect, useState } from 'react';
import { input } from '../engine/input/input';
import { createPhysics, type PhysicsWorld } from '../engine/physics/physics';
import { useT } from '../i18n';
import { useGame } from '../store/gameStore';
import { runtime } from '../store/runtime';
import { bootSession, startAutosave, stopAutosave } from '../systems/persistence/session';
import { ToolOverlay } from '../ui/camera/ToolOverlay';
import { Hud } from '../ui/hud/Hud';
import { MainMenu } from '../ui/menus/MainMenu';
import { Overlays } from '../ui/menus/Overlays';
import { registry } from '../world/registry';
import { getWorld } from '../world/terrain/heightmap';
import { GameCanvas } from './GameCanvas';

declare global {
  interface Window {
    /** Debug / automation handle. Read-only helpers; no gameplay shortcuts are bound to it. */
    __WO__?: {
      runtime: typeof runtime;
      store: typeof useGame;
      registry: typeof registry;
      input: typeof input;
      teleport: (x: number, z: number) => void;
      lookAt: (x: number, y: number, z: number) => void;
      heightAt: (x: number, z: number) => number;
    };
  }
}

function installDebugHandle(): void {
  window.__WO__ = {
    runtime,
    store: useGame,
    registry,
    input,
    teleport: (x, z) => {
      const world = getWorld();
      runtime.player.pos.set(x, Math.max(world.heightAt(x, z), -1.3), z);
      runtime.player.vel.set(0, 0, 0);
      registry.physics?.teleport(runtime.player.pos);
    },
    heightAt: (x, z) => getWorld().heightAt(x, z),
    lookAt: (x, y, z) => {
      const c = runtime.camera.pos;
      const dx = x - c.x;
      const dy = y - c.y;
      const dz = z - c.z;
      runtime.player.yaw = Math.atan2(-dx, -dz);
      runtime.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
  };
}

export function App(): React.JSX.Element {
  const screen = useGame((s) => s.screen);
  const language = useGame((s) => s.settings.language);
  const [physics, setPhysics] = useState<PhysicsWorld | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    let created: PhysicsWorld | null = null;
    (async () => {
      // Let the loading screen paint before the terrain is generated.
      await new Promise((r) => setTimeout(r, 30));
      getWorld();
      created = await createPhysics();
      if (cancelled) {
        created.dispose();
        return;
      }
      registry.physics = created;
      setPhysics(created);
      await bootSession();
      if (cancelled) return;
      installDebugHandle();
      startAutosave();
      useGame.getState().setScreen('menu');
    })().catch((err: unknown) => setBootError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      stopAutosave();
      created?.dispose();
      registry.physics = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="app" data-screen={screen}>
      {screen !== 'loading' && <GameCanvas physics={physics} />}
      {screen === 'loading' && (
        <div className="loading" role="status">
          <h1>{t('app.title')}</h1>
          <p>{bootError ?? t('app.loading')}</p>
          {!bootError && <div className="loading-bar" />}
        </div>
      )}
      {(screen === 'menu' || screen === 'role') && <MainMenu />}
      {screen === 'playing' && (
        <>
          <ToolOverlay />
          <Hud />
          <Overlays />
        </>
      )}
    </div>
  );
}
