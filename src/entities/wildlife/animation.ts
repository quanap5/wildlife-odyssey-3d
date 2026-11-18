/** Procedural animation for the animal rigs: gaits, flapping, swimming, grazing. */
import { clamp, damp, lerp } from '../../utils/math';
import type { RigInstance } from './models';
import type { Behavior } from './types';

/** Golden-angle step (rad): successive wing positions never repeat in a short cycle. */
export const FAST_WING_STEP = 2.399963;

export interface AnimState {
  behavior: Behavior;
  /** Current speed (m/s). */
  speed: number;
  runSpeed: number;
  /** Simulation clock (s) - already scaled by slow motion. */
  time: number;
  /** True while airborne (birds, insects). */
  airborne: boolean;
  /** Vertical pitch of travel for fish and flyers (rad). */
  pitch: number;
  bank: number;
  /** The animal has reached the spot where it performs the behaviour. */
  atTarget: boolean;
}

function quadruped(r: RigInstance, s: AnimState, dt: number): void {
  const def = r.def;
  const moving = s.speed > 0.04;
  const stride = (def.legLength * (def.hop ? 3.2 : 1.7) + s.speed * 0.16) * def.scale;
  if (moving) r.phase += (dt * s.speed * Math.PI * 2) / Math.max(0.05, stride);
  const amp = moving ? clamp(0.28 + (s.speed / Math.max(0.1, s.runSpeed)) * 0.75, 0, 1) : 0;
  const resting = s.behavior === 'resting';
  r.crouch = damp(r.crouch, resting ? 1 : 0, 3, dt);
  const a = Math.sin(r.phase) * amp;
  const b = Math.sin(r.phase + Math.PI) * amp;
  const tuck = r.crouch * 1.25;
  const p = r.parts;
  if (def.hop) {
    const front = Math.sin(r.phase) * amp * 0.9;
    const hind = Math.sin(r.phase + 2.6) * amp * 1.2;
    p.legFL!.rotation.x = front - tuck;
    p.legFR!.rotation.x = front - tuck;
    p.legBL!.rotation.x = hind + tuck;
    p.legBR!.rotation.x = hind + tuck;
    r.inner.position.y = (moving ? Math.abs(Math.sin(r.phase * 0.5)) * def.legLength * 1.1 : 0) - r.crouch * def.legLength * 0.5;
    r.inner.rotation.x = moving ? -Math.cos(r.phase) * 0.16 * amp : 0;
  } else {
    p.legFL!.rotation.x = a - tuck;
    p.legBR!.rotation.x = a + tuck;
    p.legFR!.rotation.x = b - tuck;
    p.legBL!.rotation.x = b + tuck;
    r.inner.position.y = Math.abs(Math.sin(r.phase)) * 0.018 * amp - r.crouch * def.legLength * 0.62;
    r.inner.rotation.x = 0;
  }
  let neck = Math.sin(s.time * 0.7 + r.phase) * 0.04;
  let look = 0;
  switch (s.behavior) {
    case 'feeding':
      neck = 1.55 + Math.sin(s.time * 3.1) * 0.07;
      r.inner.rotation.x += 0.08;
      break;
    case 'drinking':
      if (s.atTarget) {
        neck = 1.7 + Math.sin(s.time * 2.2) * 0.04;
        r.inner.rotation.x += 0.12;
      }
      break;
    case 'alert':
      neck = -0.22;
      break;
    case 'searching':
      neck = -0.15;
      look = Math.sin(s.time * 1.3) * 0.7;
      break;
    case 'fleeing':
    case 'running':
      neck = 0.18;
      break;
    case 'resting':
      neck = 0.45;
      break;
    default:
      break;
  }
  r.neck = damp(r.neck, neck, 5, dt);
  p.neck!.rotation.x = r.neck;
  p.neck!.rotation.y = damp(p.neck!.rotation.y, look, 4, dt);
}

function bird(r: RigInstance, s: AnimState, dt: number): void {
  const def = r.def;
  const p = r.parts;
  r.fold = damp(r.fold, s.airborne ? 0 : 1, 9, dt);
  r.phase += dt * def.flapHz * Math.PI * 2;
  const glide = def.flapHz < 1;
  const flap = s.airborne ? (glide ? 0.12 + Math.sin(r.phase) * 0.06 : Math.sin(r.phase) * 0.85) : 0;
  const z = lerp(flap, -1.32, r.fold);
  const y = lerp(0, 1.15, r.fold);
  p.wingL!.rotation.set(0, y, z);
  p.wingR!.rotation.set(0, -y, -z);
  const sx = lerp(1, 0.52, r.fold);
  p.wingL!.scale.set(sx, 1, 1);
  p.wingR!.scale.set(sx, 1, 1);
  let pitch = lerp(def.upright - s.pitch, 0, r.fold);
  let bob = 0;
  if (!s.airborne) {
    if (s.behavior === 'feeding') pitch = 0.55 + Math.max(0, Math.sin(s.time * 4.2 + r.phase * 0.01)) * 0.35;
    else if (s.behavior === 'calling') pitch = -0.28 + Math.sin(s.time * 16) * 0.03;
    else if (s.behavior === 'alert') pitch = -0.18;
    else if (s.behavior === 'resting') bob = -def.legLength * 0.6;
    if (s.speed > 0.05) bob += Math.abs(Math.sin(s.time * 9)) * 0.012;
  }
  r.inner.rotation.x = damp(r.inner.rotation.x, pitch, 8, dt);
  r.inner.rotation.z = damp(r.inner.rotation.z, s.airborne ? s.bank : 0, 4, dt);
  r.inner.position.y = damp(r.inner.position.y, bob, 6, dt);
}

function fish(r: RigInstance, s: AnimState, dt: number): void {
  r.phase += dt * (3 + s.speed * 9);
  const amp = 0.25 + Math.min(1, s.speed / Math.max(0.1, s.runSpeed)) * 0.45;
  r.parts.tail!.rotation.y = Math.sin(r.phase) * amp * 1.5;
  r.inner.rotation.y = Math.sin(r.phase - 1.1) * amp * 0.22;
  r.inner.rotation.x = damp(r.inner.rotation.x, -s.pitch, 5, dt);
}

function lizard(r: RigInstance, s: AnimState, dt: number): void {
  const moving = s.speed > 0.03;
  if (moving) r.phase += dt * (8 + s.speed * 5);
  r.inner.rotation.y = moving ? Math.sin(r.phase) * 0.2 : 0;
  r.parts.tail!.rotation.y = moving ? -Math.sin(r.phase) * 0.5 : Math.sin(s.time * 0.6) * 0.1;
  // Agamids hold the forebody up and do "push-up" displays when alert.
  const pushUp = s.behavior === 'alert' || s.behavior === 'idle' ? Math.max(0, Math.sin(s.time * 5 + r.phase)) * 0.1 : 0;
  r.inner.rotation.x = damp(r.inner.rotation.x, -0.2 - pushUp, 10, dt);
}

function toad(r: RigInstance, s: AnimState, dt: number): void {
  const moving = s.speed > 0.03;
  if (moving) r.phase += dt * 7;
  r.inner.position.y = moving ? Math.abs(Math.sin(r.phase)) * 0.045 : 0;
  r.inner.rotation.x = moving ? -Math.cos(r.phase) * 0.25 : 0;
  // Throat pulsing while it calls.
  const pulse = s.behavior === 'calling' ? 1 + Math.sin(s.time * 20) * 0.04 : 1;
  r.inner.scale.setScalar(pulse);
}

function insectWings(r: RigInstance, s: AnimState, dt: number): void {
  const def = r.def;
  const p = r.parts;
  const kind = def.kind;
  if (kind === 'butterfly') {
    const hz = s.airborne ? def.flapHz : s.behavior === 'feeding' ? 0.7 : 0;
    r.phase += dt * hz * Math.PI * 2;
    const open = hz > 0 ? (Math.sin(r.phase) + 1) / 2 : 0;
    const angle = s.airborne ? lerp(1.25, -0.2, open) : s.behavior === 'feeding' ? lerp(1.3, 0.25, open) : 1.38;
    p.wingL!.rotation.z = angle;
    p.wingR!.rotation.z = -angle;
    r.inner.rotation.x = s.airborne ? -0.25 : 0;
  } else {
    // Bee and dragonfly wingbeats are far faster than any display. Integrating them over
    // the frame time freezes the wings whenever the frame time is a whole number of beats
    // (40 Hz at 10, 20 or 40 fps), so step by a fixed non-repeating angle per frame instead:
    // the wings read as a blur at every frame rate.
    r.phase += def.flapHz > 12 ? FAST_WING_STEP : dt * def.flapHz * Math.PI * 2;
    const amp = s.airborne ? (kind === 'bee' ? 0.9 : 0.28) : 0;
    const angle = Math.sin(r.phase) * amp + (kind === 'bee' && !s.airborne ? -0.2 : 0);
    p.wingL!.rotation.z = angle;
    p.wingR!.rotation.z = -angle;
    r.inner.rotation.x = damp(r.inner.rotation.x, -s.pitch * 0.6, 6, dt);
  }
  r.inner.rotation.z = damp(r.inner.rotation.z, s.bank, 5, dt);
}

function beetle(r: RigInstance, s: AnimState, dt: number): void {
  if (s.speed > 0.01) r.phase += dt * 9;
  r.inner.rotation.z = Math.sin(r.phase) * 0.06;
  r.inner.rotation.y = Math.sin(r.phase * 0.5) * 0.08;
}

export function animateRig(r: RigInstance, s: AnimState, dt: number): void {
  switch (r.def.kind) {
    case 'quadruped':
      quadruped(r, s, dt);
      break;
    case 'bird':
      bird(r, s, dt);
      break;
    case 'fish':
      fish(r, s, dt);
      break;
    case 'lizard':
      lizard(r, s, dt);
      break;
    case 'toad':
      toad(r, s, dt);
      break;
    case 'butterfly':
    case 'bee':
    case 'dragonfly':
      insectWings(r, s, dt);
      break;
    case 'beetle':
      beetle(r, s, dt);
      break;
  }
}
