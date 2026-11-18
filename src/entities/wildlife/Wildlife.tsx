/** Mounts the wildlife simulation into the scene and ticks it every frame. */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { DRAW_DISTANCE } from '../../config';
import { audio } from '../../engine/audio/audio';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { registry } from '../../world/registry';
import { WildlifeSystem, type SimContext } from './WildlifeSystem';

/** Stand-in player position while the menu camera orbits: far from every habitat. */
const MENU_OBSERVER = new Vector3(0, 0, 60);

export function Wildlife(): React.JSX.Element {
  const { camera } = useThree();
  const system = useMemo(() => new WildlifeSystem(), []);

  useEffect(() => {
    registry.wildlife = system;
    system.onCall = (agent) => {
      const voice = agent.profile.voice;
      if (!voice) return;
      const dx = agent.position.x - camera.position.x;
      const dz = agent.position.z - camera.position.z;
      const distance = Math.hypot(dx, dz);
      // Pan from the bearing of the caller relative to where the camera looks.
      const yaw = runtime.player.yaw;
      const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      audio.call(voice, distance, distance > 0.5 ? right / distance : 0);
    };
    return () => {
      system.onCall = null;
      system.dispose();
      if (registry.wildlife === system) registry.wildlife = null;
    };
  }, [system, camera]);

  const ctx = useMemo<SimContext>(
    () => ({ dt: 0, time: 0, player: runtime.player.pos, playerSpeed: 0, playerCrouching: false, playerInWater: false, camera: camera.position, hour: 8, raining: false, foggy: false, activeRadius: 150 }),
    [camera],
  );

  useFrame((_, rawDt) => {
    if (runtime.paused) return;
    const s = useGame.getState();
    ctx.dt = Math.min(rawDt, 0.1) * runtime.time.scale;
    ctx.time = runtime.time.sim;
    ctx.playerSpeed = s.screen === 'playing' ? runtime.player.speed : 0;
    ctx.playerCrouching = runtime.player.crouching;
    ctx.playerInWater = runtime.player.inWater;
    ctx.hour = runtime.time.hour;
    ctx.raining = runtime.weather.rain > 0.4;
    ctx.foggy = runtime.weather.fog > 0.5;
    ctx.activeRadius = DRAW_DISTANCE[s.settings.drawDistance].wildlife;
    // On the menu the camera orbits the camp; keep the animals calm.
    if (s.screen !== 'playing') ctx.player = MENU_OBSERVER;
    else ctx.player = runtime.player.pos;
    system.update(ctx);
    runtime.perf.agents = system.agents.length;
    runtime.perf.activeAgents = system.activeCount;
  }, -2);

  return <primitive object={system.group} />;
}
