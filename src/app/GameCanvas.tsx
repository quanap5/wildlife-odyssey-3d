/** The 3D viewport: mounts every world system inside one React Three Fiber canvas. */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { PLAYER } from '../config';
import { audio, type AmbienceMix } from '../engine/audio/audio';
import { input } from '../engine/input/input';
import type { PhysicsWorld } from '../engine/physics/physics';
import { RenderLoop } from '../engine/rendering/RenderLoop';
import { Ambience } from '../world/weather/Ambience';
import { Player } from '../entities/player/Player';
import { Wildlife } from '../entities/wildlife/Wildlife';
import { useGame } from '../store/gameStore';
import { runtime } from '../store/runtime';
import { InteractionSystem } from '../systems/interaction/Interaction';
import { installControls } from '../systems/interaction/controls';
import { clamp01 } from '../utils/math';
import { Structures, WaypointBeacon } from '../world/structures/Structures';
import { lakeDistance, riverDistance } from '../world/terrain/heightmap';
import { LAKE, POOL } from '../world/terrain/layout';
import { Terrain } from '../world/terrain/Terrain';
import { Vegetation } from '../world/vegetation/Vegetation';
import { Water } from '../world/water/Water';
import { Sky } from '../world/weather/Sky';

const mix: AmbienceMix = { wind: 0, insects: 0, river: 0, waterfall: 0, rain: 0, night: 0, underwater: 0 };

/** Wires DOM input to the canvas and blends the ambience from where the player stands. */
function Director(): null {
  const gl = useThree((s) => s.gl);
  const master = useGame((s) => s.settings.master);
  const music = useGame((s) => s.settings.music);
  const effects = useGame((s) => s.settings.effects);

  useEffect(() => {
    input.attach(gl.domElement);
    const dispose = installControls(() => gl.domElement);
    return () => {
      dispose();
      input.detach();
    };
  }, [gl]);

  useEffect(() => audio.setVolumes(master, music, effects), [master, music, effects]);

  useFrame((_, dt) => {
    const p = runtime.camera.pos;
    const day = runtime.time.daylight;
    const forest = runtime.player.biome === 'rainforest' || runtime.player.biome === 'ruins';
    const water = Math.min(riverDistance(p.x, p.z), Math.max(0, (lakeDistance(p.x, p.z) - 0.9) * Math.min(LAKE.rx, LAKE.rz)));
    const fall = Math.hypot(p.x - POOL.x, p.z - POOL.z - 12);
    mix.wind = 0.35 + clamp01((p.y - 15) / 60) * 0.65 + runtime.weather.rain * 0.3;
    mix.insects = (forest ? 1 : 0.35) * day * (1 - runtime.weather.rain * 0.8);
    mix.river = clamp01(1 - water / 45);
    mix.waterfall = clamp01(1 - fall / 110) ** 2;
    mix.rain = runtime.weather.rain;
    mix.night = clamp01(1 - day * 1.6) * (1 - runtime.weather.rain * 0.6);
    mix.underwater = runtime.camera.underwater ? 1 : 0;
    audio.update(Math.min(dt, 0.1), mix);
  });

  return null;
}

export function GameCanvas({ physics }: { physics: PhysicsWorld | null }): React.JSX.Element {
  return (
    <Canvas
      className="viewport"
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: PLAYER.baseFov, near: 0.08, far: 2600, position: [0, 20, 100] }}
      dpr={1}
      onCreated={({ gl }) => {
        gl.setClearColor('#9fc3de');
        gl.domElement.setAttribute('data-testid', 'game-canvas');
      }}
    >
      <Sky />
      <Ambience />
      <Terrain />
      <Vegetation />
      <Water />
      <Structures />
      <WaypointBeacon />
      <Wildlife />
      <Player physics={physics} />
      <InteractionSystem />
      <Director />
      <RenderLoop />
    </Canvas>
  );
}
