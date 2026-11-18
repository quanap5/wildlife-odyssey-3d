/**
 * Player controller and cameras. Handles walking, sprinting, crouching,
 * jumping, swimming / diving, ground snapping and collision (through the
 * physics backend), plus first-person, third-person and tool cameras with
 * optical-style zoom, smoothing and camera collision.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type BufferGeometry } from 'three';
import { CAMP, LENS_TOOLS, PLAYER, VIEW, WORLD, ZOOM_PRESETS } from '../../config';
import { audio } from '../../engine/audio/audio';
import { approach, easeInOut, resolveBoom } from '../../engine/camera/boom';
import { fovForZoom, stepZoom } from '../../engine/camera/zoom';
import { input } from '../../engine/input/input';
import type { PhysicsWorld } from '../../engine/physics/physics';
import { useGame, type Tool } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { segmentBlocked } from '../../systems/identification/targeting';
import { clamp, damp } from '../../utils/math';
import { getStructureBlockers, registry } from '../../world/registry';
import { getWorld } from '../../world/terrain/heightmap';
import { buildProp, isHeldItem, resolveHeldItem, stepHeld, type HeldItem } from './heldItems';

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
const _mid = new Vector3();

export const isLensTool = (tool: Tool): boolean => (LENS_TOOLS as readonly string[]).includes(tool);

/** Shoulder, hanging hand and raised hand of the avatar's right arm (avatar space: +z ahead, -x its right). */
const ARM = { shoulder: [-0.27, 1.32, 0] as const, length: 0.46, raised: -1.15 };
/** Props are drawn a little larger than life on the avatar so they read at a distance. */
const AVATAR_PROP_SCALE = 1.5;

export function Player({ physics }: { physics: PhysicsWorld | null }): React.JSX.Element {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const avatar = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const prop = useRef<Mesh>(null);
  const quality = useGame((s) => s.settings.quality);
  // One vertex-coloured geometry per prop, built on first use and shared with nothing else.
  const props = useMemo(() => ({ simple: quality === 'low', cache: new Map<HeldItem, BufferGeometry>(), shown: null as HeldItem | null }), [quality]);
  const propMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }), []);
  useEffect(
    () => () => {
      for (const g of props.cache.values()) g.dispose();
      props.cache.clear();
    },
    [props],
  );
  useEffect(() => () => propMaterial.dispose(), [propMaterial]);
  const world = useMemo(() => getWorld(), []);
  const local = useRef({ eye: PLAYER.eyeHeight as number, smoothY: 0, vy: 0, stepAccum: 0, moveAccum: 0, bobPhase: 0, lastYaw: 0, lastPitch: 0, initialised: false, menuAngle: 0.6, viewBlend: 0, boom: 0 });

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
      runtime.camera.third = 0;
      runtime.held.item = null;
      runtime.held.raise = 0;
      runtime.held.atEye = false;
      runtime.held.flash = null;
      L.viewBlend = 0;
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

    /* ---- what is in the hand ---- */
    const held = runtime.held;
    const now = performance.now();
    // An action's item stays up while its panel is open, otherwise only for its short moment.
    if (held.flash && now >= held.flashUntil && st.overlay !== 'reader' && st.overlay !== 'inspect') held.flash = null;
    stepHeld(held, resolveHeldItem({ tool: st.tool, overlay: st.overlay, flash: isHeldItem(held.flash) ? held.flash : null, enabled: st.settings.heldItems }), frameDt);

    /* ---- camera ---- */
    const tooling = st.tool !== 'none';
    // Lens tools are looked through, so they always use the first-person view; the chosen view returns afterwards.
    const wantThird = st.viewMode === 'third' && !isLensTool(st.tool);
    L.viewBlend = approach(L.viewBlend, wantThird ? 1 : 0, frameDt / VIEW.transition);
    const blend = easeInOut(L.viewBlend);
    const firstPerson = blend < 0.5;
    L.eye = damp(L.eye, p.crouching || diving ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, diving ? 4 : 10, frameDt);
    L.smoothY = Math.abs(L.smoothY - p.pos.y) > 2 ? p.pos.y : damp(L.smoothY, p.pos.y, 18, frameDt);
    if (p.grounded && p.speed > 0.5) L.bobPhase += travelled * 4.2;
    const bob = tooling ? 0 : Math.sin(L.bobPhase) * 0.03 * clamp(p.speed / PLAYER.walkSpeed, 0, 1.4) * (1 - blend);
    _head.set(p.pos.x, L.smoothY + L.eye + bob, p.pos.z);
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    camera.getWorldDirection(_fwd);
    let boomNow = 0;
    if (blend <= 0) {
      camera.position.copy(_head);
      L.boom = 0;
    } else {
      // Over the right shoulder. The boom is the longest one with nothing between the head and the camera:
      // not the ground, not a trunk or boulder, not a wall.
      const blockers = registry.plantBlockers;
      const structures = getStructureBlockers();
      const rightX = Math.cos(p.yaw);
      const rightZ = -Math.sin(p.yaw);
      const place = (dist: number, out: Vector3): Vector3 => {
        const side = VIEW.shoulder * Math.min(1, dist / 1.6);
        out.copy(_head).addScaledVector(_fwd, -dist);
        out.x += rightX * side;
        out.z += rightZ * side;
        out.y += VIEW.lift * Math.min(1, dist / 1.6);
        return out;
      };
      const clearAt = (dist: number): boolean => {
        place(dist, _cam);
        if (_cam.y < world.heightAt(_cam.x, _cam.z) + 0.35) return false;
        _mid.lerpVectors(_head, _cam, 0.5);
        if (_mid.y < world.heightAt(_mid.x, _mid.z) + 0.25) return false;
        return !segmentBlocked(_head, _cam, blockers) && !segmentBlocked(_head, _cam, structures);
      };
      const target = resolveBoom(VIEW.boom, VIEW.minBoom, clearAt);
      // Pull in at once when something gets in the way; ease back out when it clears.
      L.boom = target < L.boom ? target : damp(L.boom, target, 5, frameDt);
      boomNow = L.boom;
      if (boomNow > 0.01) camera.position.lerpVectors(_head, place(boomNow, _cam), blend);
      else camera.position.copy(_head);
    }
    runtime.camera.third = blend;

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
      // The avatar appears once the camera has pulled far enough back not to sit inside it.
      a.visible = !firstPerson && boomNow * blend > 0.9;
      if (a.visible) {
        a.position.set(p.pos.x, L.smoothY - (p.crouching ? 0.35 : 0), p.pos.z);
        a.rotation.y = p.yaw + Math.PI;
        const swing = Math.sin(L.bobPhase) * clamp(p.speed / PLAYER.walkSpeed, 0, 1.2) * 0.7;
        if (legL.current) legL.current.rotation.x = swing;
        if (legR.current) legR.current.rotation.x = -swing;
        // The right arm comes up with whatever is being held.
        const item = isHeldItem(held.item) && st.settings.heldItems ? held.item : null;
        const lift = item ? held.raise : 0;
        const angle = ARM.raised * lift - swing * 0.5 * (1 - lift);
        if (armR.current) armR.current.rotation.x = angle;
        const m = prop.current;
        if (m) {
          m.visible = item !== null && lift > 0.02;
          if (item && m.visible) {
            if (props.shown !== item) {
              let g = props.cache.get(item);
              if (!g) {
                g = buildProp(item, props.simple);
                props.cache.set(item, g);
              }
              m.geometry = g;
              props.shown = item;
            }
            // The hand is at the end of the arm; reading matter is brought in front of the chest.
            const reading = item === 'map' || item === 'journal' || item === 'specimen';
            const hx = ARM.shoulder[0] + (reading ? 0.2 : 0.04) * lift;
            const hy = ARM.shoulder[1] - ARM.length * Math.cos(angle);
            const hz = ARM.shoulder[2] - ARM.length * Math.sin(angle) + 0.04;
            m.position.set(hx, hy, hz);
            // Props are modelled with their far side at -z; the avatar faces +z.
            m.rotation.set(item === 'specimen' ? 0.25 : reading ? -0.9 : 0.1, Math.PI, 0, 'YXZ');
            m.scale.setScalar(AVATAR_PROP_SCALE);
          }
        }
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
      {/* Left arm hangs; the right arm pivots at the shoulder and carries the held tool. */}
      <mesh position={[0.27, 1.1, 0]} rotation={[0, 0, 0.12]} castShadow>
        <capsuleGeometry args={[0.055, 0.42, 4, 8]} />
        <meshStandardMaterial color="#b9a06a" roughness={0.9} />
      </mesh>
      <group ref={armR} position={[ARM.shoulder[0], ARM.shoulder[1], ARM.shoulder[2]]}>
        <mesh position={[0, -0.22, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.42, 4, 8]} />
          <meshStandardMaterial color="#b9a06a" roughness={0.9} />
        </mesh>
      </group>
      <mesh ref={prop} visible={false} material={propMaterial} name="held-prop" castShadow />
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
