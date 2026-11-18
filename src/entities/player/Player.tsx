/**
 * Player controller and cameras. Handles walking, sprinting, crouching,
 * jumping, swimming / diving, ground snapping and collision (through the
 * physics backend), plus first-person, third-person and tool cameras with
 * optical-style zoom, smoothing and camera collision.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { CAMP, PLAYER, WORLD, ZOOM_PRESETS } from '../../config';
import { audio } from '../../engine/audio/audio';
import { fovForZoom, stepZoom } from '../../engine/camera/zoom';
import { input } from '../../engine/input/input';
import type { PhysicsWorld } from '../../engine/physics/physics';
import { useGame, type Tool } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { segmentBlocked } from '../../systems/identification/targeting';
import { clamp, damp } from '../../utils/math';
import { getStructureBlockers, registry } from '../../world/registry';
import { getWorld } from '../../world/terrain/heightmap';

const TOOL_ZOOM: Record<Tool, { initial: number; min: number; max: number }> = {
  none: { initial: 1, min: 1, max: 1 },
  camera: { initial: 2, min: ZOOM_PRESETS[0], max: ZOOM_PRESETS[ZOOM_PRESETS.length - 1]! },
  video: { initial: 2, min: ZOOM_PRESETS[0], max: ZOOM_PRESETS[ZOOM_PRESETS.length - 1]! },
  binoculars: { initial: 6, min: 4, max: 12 },
  scanner: { initial: 1.6, min: 1.6, max: 1.6 },
  macro: { initial: 1.3, min: 1.3, max: 1.3 },
};

export function zoomRange(tool: Tool): { min: number; max: number } {
  return TOOL_ZOOM[tool];
}

const _delta = new Vector3();
const _out = new Vector3();
const _fwd = new Vector3();
const _head = new Vector3();
const _cam = new Vector3();

export function Player({ physics }: { physics: PhysicsWorld | null }): React.JSX.Element {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const avatar = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const world = useMemo(() => getWorld(), []);
  const local = useRef({ eye: PLAYER.eyeHeight as number, smoothY: 0, vy: 0, stepAccum: 0, moveAccum: 0, bobPhase: 0, lastYaw: 0, lastPitch: 0, initialised: false, menuAngle: 0.6 });

  // Each tool has its own lens: reset the zoom target when the tool changes.
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.tool !== prev.tool) runtime.camera.targetZoom = TOOL_ZOOM[s.tool].initial;
        if (s.screen === 'playing' && prev.screen !== 'playing') local.current.initialised = false;
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const st = useGame.getState();
    const L = local.current;
    const p = runtime.player;
    const frameDt = Math.min(rawDt, 0.25);

    if (st.screen !== 'playing') {
      // Menu: slow cinematic orbit around the research camp.
      L.menuAngle += frameDt * 0.035;
      const r = 34;
      const cx = CAMP.x + Math.cos(L.menuAngle) * r;
      const cz = CAMP.z + Math.sin(L.menuAngle) * r;
      camera.position.set(cx, Math.max(world.heightAt(cx, cz), 0) + 9, cz);
      camera.lookAt(CAMP.x - 14, world.heightAt(CAMP.x, CAMP.z) + 3, CAMP.z + 8);
      if (camera.fov !== 55) {
        camera.fov = 55;
        camera.updateProjectionMatrix();
      }
      runtime.camera.pos.copy(camera.position);
      runtime.camera.underwater = false;
      input.enabled = false;
      return;
    }

    if (!L.initialised) {
      // First frame after (re)entering the world: settle on the ground.
      const ground = world.heightAt(p.pos.x, p.pos.z);
      if (!Number.isFinite(p.pos.y) || p.pos.y < ground - 0.2 || p.pos.y === 0) p.pos.y = Math.max(ground, -1.3);
      physics?.teleport(p.pos);
      L.smoothY = p.pos.y;
      L.vy = 0;
      L.initialised = true;
    }

    const controls = st.overlay === 'none' && !runtime.paused;
    input.enabled = controls;
    runtime.lookActive = input.locked;

    /* ---- look ---- */
    const zoom = runtime.camera.zoom;
    const [lx, ly] = input.consumeLook();
    if (controls) {
      const sens = (0.0022 * st.settings.sensitivity) / zoom;
      p.yaw -= lx * sens;
      p.pitch -= ly * sens * (st.settings.invertY ? -1 : 1);
      const keyRate = (1.7 * frameDt) / Math.pow(zoom, 0.7);
      p.yaw += input.axis('ArrowRight', 'ArrowLeft') * keyRate;
      p.pitch += input.axis('ArrowDown', 'ArrowUp') * keyRate * 0.8;
      p.pitch = clamp(p.pitch, -1.5, 1.5);
      const range = TOOL_ZOOM[st.tool];
      const wheel = input.consumeWheel();
      if (wheel !== 0 && range.max > range.min) runtime.camera.targetZoom = stepZoom(runtime.camera.targetZoom, wheel, range.min, range.max);
    } else {
      input.consumeWheel();
    }

    /* ---- movement (sub-stepped so low frame rates stay stable) ---- */
    let remaining = frameDt;
    let travelled = 0;
    let diving = false;
    while (remaining > 1e-5) {
      const dt = Math.min(remaining, 1 / 30);
      remaining -= dt;
      const fwd = controls ? input.axis('KeyS', 'KeyW') : 0;
      const strafe = controls ? input.axis('KeyA', 'KeyD') : 0;
      const sinY = Math.sin(p.yaw);
      const cosY = Math.cos(p.yaw);
      let wx = -sinY * fwd + cosY * strafe;
      let wz = -cosY * fwd - sinY * strafe;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) {
        wx /= wl;
        wz /= wl;
      }
      const ground = world.heightAt(p.pos.x, p.pos.z);
      const depth = Math.max(0, WORLD.waterLevel - ground);
      p.inWater = depth > 0.15 && p.pos.y < WORLD.waterLevel - 0.1;
      p.swimming = depth > 1.35 && p.pos.y < WORLD.waterLevel - 0.8;
      const wantCrouch = controls && (input.isDown('ControlLeft') || input.isDown('ControlRight'));
      p.crouching = wantCrouch && !p.swimming;
      diving = wantCrouch && p.swimming;
      p.sprinting = controls && (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && fwd > 0 && !p.crouching && !p.swimming && st.tool === 'none';
      let speed: number = PLAYER.walkSpeed;
      if (p.swimming) speed = PLAYER.swimSpeed;
      else if (p.crouching) speed = PLAYER.crouchSpeed;
      else if (p.sprinting) speed = PLAYER.sprintSpeed;
      else if (st.tool !== 'none') speed = PLAYER.walkSpeed * 0.6;
      if (p.inWater && !p.swimming) speed *= 0.7;
      const accel = p.grounded || p.swimming ? 12 : 3;
      p.vel.x = damp(p.vel.x, wx * speed, accel, dt);
      p.vel.z = damp(p.vel.z, wz * speed, accel, dt);

      if (p.swimming) {
        // Float with the eyes just above the surface; Ctrl lowers the camera to the bed.
        const target = wantCrouch ? Math.max(ground + 0.15, -depth) : -1.3;
        L.vy = clamp((target - p.pos.y) * 3, -2.4, 2.4);
      } else {
        L.vy -= PLAYER.gravity * dt;
        if (p.grounded && controls && input.isDown('Space')) L.vy = PLAYER.jumpSpeed;
      }

      _delta.set(p.vel.x * dt, L.vy * dt, p.vel.z * dt);
      const before = _head.copy(p.pos);
      if (physics) {
        physics.setCenter(p.pos.x, p.pos.z);
        p.grounded = physics.move(p.pos, _delta, dt, _out);
        p.pos.copy(_out);
      } else {
        p.pos.x += _delta.x;
        p.pos.z += _delta.z;
        p.pos.y = Math.max(world.heightAt(p.pos.x, p.pos.z), p.pos.y + _delta.y);
        p.grounded = p.pos.y <= world.heightAt(p.pos.x, p.pos.z) + 0.02;
      }
      if (p.grounded && L.vy < 0) L.vy = -1;

      // Safety nets: world bounds and never below the terrain.
      p.pos.x = clamp(p.pos.x, -WORLD.playLimit, WORLD.playLimit);
      p.pos.z = clamp(p.pos.z, -WORLD.playLimit, WORLD.playLimit);
      const floor = world.heightAt(p.pos.x, p.pos.z);
      if (p.pos.y < floor - 0.4) {
        p.pos.y = floor;
        L.vy = 0;
        physics?.teleport(p.pos);
      }
      const moved = Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
      travelled += moved;
      p.speed = damp(p.speed, moved / dt, 10, dt);
    }

    p.distanceWalked += travelled;
    L.moveAccum += travelled;
    if (p.grounded || p.swimming) {
      L.stepAccum += travelled;
      const stride = p.sprinting ? 2.1 : p.crouching ? 1.1 : 1.5;
      if (L.stepAccum > stride) {
        L.stepAccum = 0;
        const stone = world.slopeAt(p.pos.x, p.pos.z) > 0.2 || p.pos.y > world.heightAt(p.pos.x, p.pos.z) + 0.2;
        audio.footstep(p.inWater ? 'water' : stone ? 'stone' : 'grass', p.crouching ? 0.4 : p.sprinting ? 1.2 : 0.8);
      }
    }
    if (L.moveAccum >= 4) {
      st.emit({ type: 'moved', meters: L.moveAccum });
      L.moveAccum = 0;
    }

    /* ---- camera ---- */
    const tooling = st.tool !== 'none';
    const firstPerson = st.viewMode === 'first' || tooling;
    L.eye = damp(L.eye, p.crouching || diving ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, diving ? 4 : 10, frameDt);
    L.smoothY = Math.abs(L.smoothY - p.pos.y) > 2 ? p.pos.y : damp(L.smoothY, p.pos.y, 18, frameDt);
    if (p.grounded && p.speed > 0.5 && !tooling) L.bobPhase += travelled * 4.2;
    const bob = tooling ? 0 : Math.sin(L.bobPhase) * 0.03 * clamp(p.speed / PLAYER.walkSpeed, 0, 1.4);
    _head.set(p.pos.x, L.smoothY + L.eye + bob, p.pos.z);
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    camera.getWorldDirection(_fwd);
    if (firstPerson) {
      camera.position.copy(_head);
    } else {
      // Third person: pull the camera in until nothing lies between it and the head.
      const blockers = registry.plantBlockers;
      const structures = getStructureBlockers();
      let placed = false;
      for (const dist of [4.4, 3.4, 2.6, 1.8, 1.1, 0.6]) {
        _cam.copy(_head).addScaledVector(_fwd, -dist);
        _cam.y += 0.45;
        const ground = world.heightAt(_cam.x, _cam.z);
        if (_cam.y < ground + 0.35) continue;
        if (segmentBlocked(_head, _cam, blockers) || segmentBlocked(_head, _cam, structures)) continue;
        camera.position.copy(_cam);
        placed = true;
        break;
      }
      if (!placed) camera.position.copy(_head);
    }

    const cam = runtime.camera;
    cam.zoom = damp(cam.zoom, cam.targetZoom, 9, frameDt);
    const fov = fovForZoom(PLAYER.baseFov + (p.sprinting ? 4 : 0), cam.zoom);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = damp(camera.fov, fov, 14, frameDt);
      camera.updateProjectionMatrix();
    }
    cam.fov = camera.fov;
    cam.pos.copy(camera.position);
    cam.dir.copy(_fwd);
    cam.angularSpeed = damp(cam.angularSpeed, (Math.abs(p.yaw - L.lastYaw) + Math.abs(p.pitch - L.lastPitch)) / Math.max(frameDt, 1e-3), 8, frameDt);
    L.lastYaw = p.yaw;
    L.lastPitch = p.pitch;
    cam.underwater = camera.position.y < WORLD.waterLevel - 0.03 && world.heightAt(camera.position.x, camera.position.z) < camera.position.y;

    const a = avatar.current;
    if (a) {
      a.visible = !firstPerson;
      if (a.visible) {
        a.position.set(p.pos.x, L.smoothY - (p.crouching ? 0.35 : 0), p.pos.z);
        a.rotation.y = p.yaw + Math.PI;
        const swing = Math.sin(L.bobPhase) * clamp(p.speed / PLAYER.walkSpeed, 0, 1.2) * 0.7;
        if (legL.current) legL.current.rotation.x = swing;
        if (legR.current) legR.current.rotation.x = -swing;
      }
    }
  }, -3);

  return (
    <group ref={avatar} visible={false} name="researcher">
      {/* A simple, readable field researcher: boots, trousers, shirt, backpack, hat. */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
        <meshStandardMaterial color="#b9a06a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color="#c99772" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.69, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.27, 0.03, 16]} />
        <meshStandardMaterial color="#6b5a3a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.11, 12]} />
        <meshStandardMaterial color="#6b5a3a" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.15, -0.2]} castShadow>
        <boxGeometry args={[0.32, 0.42, 0.16]} />
        <meshStandardMaterial color="#44563a" roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.27, 1.1, 0]} rotation={[0, 0, s * 0.12]} castShadow>
          <capsuleGeometry args={[0.055, 0.42, 4, 8]} />
          <meshStandardMaterial color="#b9a06a" roughness={0.9} />
        </mesh>
      ))}
      <group ref={legL} position={[0.1, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.62, 4, 8]} />
          <meshStandardMaterial color="#4a4436" roughness={0.95} />
        </mesh>
      </group>
      <group ref={legR} position={[-0.1, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.62, 4, 8]} />
          <meshStandardMaterial color="#4a4436" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}
