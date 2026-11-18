/**
 * Hand-held research tools: which item the researcher holds, the raise / lower
 * state machine, the first-person pose, and the procedural props themselves.
 * Everything except `buildProp` is pure so it can be unit-tested.
 */
import { BoxGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry, Color, type Vector3 } from 'three';
import { GeoBuilder, type ColorFn } from '../../engine/rendering/geoBuilder';
import type { Overlay, Tool } from '../../store/gameStore';

export const HELD_ITEMS = ['binoculars', 'camera', 'scanner', 'macro', 'map', 'journal', 'specimen'] as const;
export type HeldItem = (typeof HELD_ITEMS)[number];

/** Props that are raised to the eye: once there, the existing lens view replaces them. */
export const LENS_ITEMS: ReadonlySet<HeldItem> = new Set<HeldItem>(['binoculars', 'camera', 'macro']);

/** Photo and video share one camera body. */
export const TOOL_ITEM: Record<Tool, HeldItem | null> = {
  none: null,
  camera: 'camera',
  video: 'camera',
  binoculars: 'binoculars',
  scanner: 'scanner',
  macro: 'macro',
};

export interface HeldContext {
  tool: Tool;
  overlay: Overlay;
  /** Item an action is showing right now (map or journal being raised, a specimen being examined). */
  flash: HeldItem | null;
  /** The "hand-held items" setting. */
  enabled: boolean;
}

/** The item that should be in the hand. Open panels win over an action, which wins over the equipped tool. */
export function resolveHeldItem(c: HeldContext): HeldItem | null {
  if (!c.enabled) return null;
  if (c.overlay === 'map') return 'map';
  if (c.overlay === 'journal') return 'journal';
  if (c.flash) return c.flash;
  return TOOL_ITEM[c.tool];
}

export const isHeldItem = (v: string | null): v is HeldItem => v !== null && (HELD_ITEMS as readonly string[]).includes(v);

export const RAISE_TIME = 0.2;
export const LOWER_TIME = 0.16;

export interface HeldState {
  item: string | null;
  raise: number;
  atEye: boolean;
}

/** Advances the raise / lower animation: the current item is lowered before a different one comes up. */
export function stepHeld(s: HeldState, desired: HeldItem | null, dt: number): void {
  if (s.item !== desired) {
    if (s.item !== null && s.raise > 0) s.raise = Math.max(0, s.raise - dt / LOWER_TIME);
    if (s.item === null || s.raise <= 0) {
      s.item = desired;
      s.raise = 0;
    }
  } else if (s.item !== null) {
    s.raise = Math.min(1, s.raise + dt / RAISE_TIME);
  }
  s.atEye = s.item !== null && s.item === desired && LENS_ITEMS.has(s.item as HeldItem) && s.raise >= 1;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Resting pose in camera space (x right, y up, -z ahead), tuned for the view model's 48 degree lens. */
export const REST_POSE: Record<HeldItem, Pose> = {
  scanner: { x: 0.25, y: -0.175, z: -0.5, rx: -0.34, ry: -0.42, rz: 0.06 },
  map: { x: 0, y: -0.2, z: -0.52, rx: -0.98, ry: 0, rz: 0 },
  journal: { x: 0, y: -0.2, z: -0.5, rx: -1.02, ry: 0, rz: 0 },
  specimen: { x: 0.17, y: -0.2, z: -0.5, rx: 0.5, ry: -0.25, rz: 0 },
  binoculars: { x: 0.2, y: -0.2, z: -0.48, rx: 0.2, ry: -0.3, rz: 0.1 },
  camera: { x: 0.2, y: -0.19, z: -0.5, rx: 0.1, ry: -0.25, rz: 0.05 },
  macro: { x: 0.2, y: -0.19, z: -0.46, rx: 0.15, ry: -0.3, rz: 0.08 },
};

/** Size of each prop in the first-person view relative to the model (the avatar uses its own scale). */
export const VIEW_SCALE: Record<HeldItem, number> = { scanner: 0.8, map: 0.9, journal: 0.9, specimen: 0.85, binoculars: 1, camera: 1, macro: 1 };

/** Where a lens prop ends up: in front of the eye, at which point the lens view takes over. */
export const EYE_POSE: Pose = { x: 0, y: -0.02, z: -0.13, rx: 0, ry: 0, rz: 0 };

/** How far below its resting place an item starts and ends (out of frame). */
export const STOW_DROP = 0.32;

export interface PoseMotion {
  /** Seconds, for the slow breathing sway. */
  time: number;
  /** Walk-cycle phase in radians. */
  bob: number;
  /** 0 standing .. about 1.4 sprinting. */
  pace: number;
  /** Lag behind camera turns, in metres. */
  swayX: number;
  swayY: number;
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);

/**
 * First-person pose for an item at a given raise (0 stowed, 1 raised).
 * The scanner is an aiming tool: while the player stands still it is held dead steady.
 */
export function viewModelPose(item: HeldItem, raise: number, m: PoseMotion): Pose {
  const rest = REST_POSE[item];
  const e = easeOut(Math.max(0, Math.min(1, raise)));
  let p: Pose;
  if (LENS_ITEMS.has(item)) {
    // Up from the hip to the eye.
    p = {
      x: rest.x + (EYE_POSE.x - rest.x) * e,
      y: rest.y - STOW_DROP * (1 - e) * (1 - e) + (EYE_POSE.y - rest.y) * e,
      z: rest.z + (EYE_POSE.z - rest.z) * e,
      rx: rest.rx * (1 - e),
      ry: rest.ry * (1 - e),
      rz: rest.rz * (1 - e),
    };
  } else {
    p = { x: rest.x, y: rest.y - STOW_DROP * (1 - e), z: rest.z, rx: rest.rx + 0.5 * (1 - e), ry: rest.ry, rz: rest.rz };
  }
  const still = m.pace < 0.05;
  const steady = item === 'scanner' && still;
  const breathe = steady ? 0 : Math.sin(m.time * 1.6) * 0.0025;
  const stride = Math.min(1.4, m.pace);
  p.x += m.swayX + Math.cos(m.bob * 0.5) * 0.004 * stride;
  p.y += m.swayY + breathe + Math.abs(Math.sin(m.bob)) * -0.006 * stride;
  p.rz += m.swayX * 1.6;
  p.rx += m.swayY * 1.2;
  return p;
}

/** Where the scanner's lit screen sits on the prop (model space). */
export const SCANNER_SCREEN = { w: 0.056, h: 0.076, x: 0, y: 0.022, z: 0.0146 } as const;
/** Unlit screen colour. Also what the capture test looks for to prove the prop is not in photographs. */
export const SCANNER_SCREEN_COLOR = '#28ffdc';

const HALF_PI = Math.PI / 2;
const box = (w: number, h: number, d: number, sw = 1, sh = 1): BufferGeometry => new BoxGeometry(w, h, d, sw, sh, 1);
/** Cylinder along z: `rNear` faces the holder (+z), `rFar` points away (-z). */
const tube = (rNear: number, rFar: number, length: number, radial: number): BufferGeometry => new CylinderGeometry(rNear, rFar, length, radial, 1, false);
const post = (r: number, h: number, radial: number): BufferGeometry => new CylinderGeometry(r, r, h, radial, 1, false);

const PAPER = new Color('#e9dfc2');
const PAPER_BACK = new Color('#d8cdae');
const RIVER = new Color('#6fa3bd');
const WOOD = new Color('#9db884');
/** Printed map: a river and patches of forest on paper; plain on the back. */
const mapInk: ColorFn = (p: Vector3, n: Vector3) => {
  if (n.z < 0.2) return PAPER_BACK;
  if (Math.abs(p.x - 0.03 - 0.035 * Math.sin(p.y * 26)) < 0.011) return RIVER;
  if (Math.sin(p.x * 41 + 1.3) + Math.cos(p.y * 33) > 0.75) return WOOD;
  return PAPER;
};
const PAGE = new Color('#efe6cf');
const RULE = new Color('#cdbf9c');
/** Ruled notebook page. */
const pageInk: ColorFn = (p: Vector3, n: Vector3) => (n.z > 0.2 && Math.abs(((p.y + 1) * 62) % 2 - 1) < 0.34 ? RULE : PAGE);

/**
 * Builds one prop as a single vertex-coloured geometry (one draw call).
 * Model space: x right, y up, the side the holder sees faces +z. `simple` drops the small parts (Low preset).
 */
export function buildProp(item: HeldItem, simple = false): BufferGeometry {
  const b = new GeoBuilder();
  const r = simple ? 8 : 14;
  switch (item) {
    case 'binoculars': {
      for (const s of [-1, 1]) {
        b.add(tube(0.021, 0.03, 0.1, r), { pos: [s * 0.036, 0, 0], rot: [HALF_PI, 0, 0], color: '#23281f' });
        b.add(tube(0.033, 0.033, 0.014, r), { pos: [s * 0.036, 0, -0.05], rot: [HALF_PI, 0, 0], color: '#11130f' });
        b.add(tube(0.019, 0.019, 0.022, r), { pos: [s * 0.036, 0, 0.058], rot: [HALF_PI, 0, 0], color: '#0d0e0c' });
        if (!simple) b.add(tube(0.027, 0.027, 0.004, r), { pos: [s * 0.036, 0, -0.058], rot: [HALF_PI, 0, 0], color: '#3d6a8a' });
      }
      b.add(box(0.05, 0.018, 0.042), { pos: [0, 0.004, 0], color: '#1a1e17' });
      if (!simple) b.add(tube(0.011, 0.011, 0.022, 10), { pos: [0, 0.02, 0.006], rot: [HALF_PI, 0, 0], color: '#3a3f33' });
      break;
    }
    case 'camera': {
      b.add(box(0.14, 0.09, 0.055), { color: '#262724' });
      b.add(box(0.036, 0.092, 0.072), { pos: [0.06, 0, -0.006], color: '#191a18' });
      b.add(box(0.052, 0.03, 0.046), { pos: [-0.008, 0.058, 0], color: '#1f201e' });
      b.add(tube(0.041, 0.044, 0.1, r), { pos: [-0.012, -0.004, -0.076], rot: [HALF_PI, 0, 0], color: '#1d1e1c' });
      b.add(tube(0.037, 0.037, 0.004, r), { pos: [-0.012, -0.004, -0.128], rot: [HALF_PI, 0, 0], color: '#35576b' });
      if (!simple) {
        b.add(tube(0.047, 0.047, 0.026, r), { pos: [-0.012, -0.004, -0.07], rot: [HALF_PI, 0, 0], color: '#3b3c38' });
        b.add(box(0.076, 0.05, 0.002), { pos: [-0.012, -0.006, 0.0285], color: '#0e1418' });
        b.add(post(0.008, 0.007, 10), { pos: [0.058, 0.049, -0.012], color: '#b7402a' });
      }
      break;
    }
    case 'scanner': {
      b.add(box(0.078, 0.15, 0.022), { color: '#3a4a3c' });
      b.add(box(0.066, 0.087, 0.004), { pos: [0, 0.022, 0.012], color: '#141a16' });
      b.add(box(0.062, 0.03, 0.036), { pos: [0, 0.088, -0.006], color: '#262d27' });
      b.add(box(0.05, 0.062, 0.028), { pos: [0, -0.102, -0.004], color: '#1f2620' });
      if (!simple) {
        b.add(tube(0.012, 0.013, 0.02, 10), { pos: [0, 0.09, -0.03], rot: [HALF_PI, 0, 0], color: '#7fd6b0' });
        b.add(box(0.012, 0.008, 0.004), { pos: [-0.022, -0.046, 0.012], color: '#d99432' });
        b.add(box(0.012, 0.008, 0.004), { pos: [0, -0.046, 0.012], color: '#8d948b' });
        b.add(box(0.012, 0.008, 0.004), { pos: [0.022, -0.046, 0.012], color: '#8d948b' });
      }
      break;
    }
    case 'macro': {
      b.add(tube(0.036, 0.036, 0.07, r), { rot: [HALF_PI, 0, 0], color: '#1e1f1d' });
      b.add(tube(0.03, 0.03, 0.014, r), { pos: [0, 0, 0.041], rot: [HALF_PI, 0, 0], color: '#8a8d86' });
      b.add(tube(0.031, 0.031, 0.004, r), { pos: [0, 0, -0.037], rot: [HALF_PI, 0, 0], color: '#4d7f95' });
      b.add(tube(0.047, 0.047, 0.008, r), { pos: [0, 0, -0.04], rot: [HALF_PI, 0, 0], color: '#e9e6da' });
      if (!simple) b.add(tube(0.04, 0.04, 0.02, r), { pos: [0, 0, -0.008], rot: [HALF_PI, 0, 0], color: '#444540' });
      break;
    }
    case 'map': {
      const seg = simple ? 5 : 8;
      // Three panels with the creases of a folded sheet.
      b.add(box(0.09, 0.18, 0.002, seg, seg * 2), { pos: [-0.088, 0, 0.006], rot: [0, 0.16, 0], color: mapInk });
      b.add(box(0.09, 0.18, 0.002, seg, seg * 2), { pos: [0, 0, -0.001], color: mapInk });
      b.add(box(0.09, 0.18, 0.002, seg, seg * 2), { pos: [0.088, 0, 0.006], rot: [0, -0.16, 0], color: mapInk });
      if (!simple) b.add(box(0.008, 0.008, 0.003), { pos: [0.03, 0.03, 0.001], color: '#c2452d' });
      break;
    }
    case 'journal': {
      const rows = simple ? 10 : 16;
      b.add(box(0.012, 0.168, 0.008), { color: '#3e2a1b' });
      for (const s of [-1, 1]) {
        b.add(box(0.118, 0.168, 0.006), { pos: [s * 0.062, 0, 0.004], rot: [0, -s * 0.12, 0], color: '#5a3f2a' });
        b.add(box(0.108, 0.156, 0.006, 1, rows), { pos: [s * 0.06, 0, 0.0085], rot: [0, -s * 0.12, 0], color: pageInk });
      }
      if (!simple) {
        b.add(box(0.04, 0.05, 0.001), { pos: [-0.062, 0.034, 0.0145], rot: [0, 0.12, 0], color: '#7c9a5c' });
        b.add(post(0.004, 0.11, 6), { pos: [0.068, -0.012, 0.016], rot: [0, 0, 0.5], color: '#d9a441' });
        b.add(box(0.006, 0.07, 0.001), { pos: [0.004, -0.11, 0.004], color: '#b7402a' });
      }
      break;
    }
    case 'specimen': {
      b.add(box(0.17, 0.012, 0.12), { color: '#c9b891' });
      b.add(box(0.17, 0.014, 0.006), { pos: [0, 0.011, 0.057], color: '#a48f66' });
      b.add(box(0.17, 0.014, 0.006), { pos: [0, 0.011, -0.057], color: '#a48f66' });
      b.add(box(0.006, 0.014, 0.12), { pos: [0.082, 0.011, 0], color: '#a48f66' });
      b.add(box(0.006, 0.014, 0.12), { pos: [-0.082, 0.011, 0], color: '#a48f66' });
      b.add(post(0.012, 0.05, r), { pos: [0.048, 0.031, -0.014], color: '#bcd7d9' });
      b.add(post(0.011, 0.01, r), { pos: [0.048, 0.061, -0.014], color: '#8a6a44' });
      b.add(new SphereGeometry(0.03, simple ? 6 : 10, simple ? 4 : 6), { pos: [-0.03, 0.01, -0.01], scale: [1, 0.12, 0.55], rot: [0, 0.5, 0], color: '#5c8a47' });
      if (!simple) {
        b.add(new SphereGeometry(0.014, 8, 6), { pos: [0.01, 0.014, 0.028], scale: [1, 0.7, 0.8], color: '#8b877c' });
        b.add(box(0.04, 0.001, 0.024), { pos: [-0.046, 0.007, 0.034], color: '#f3ecd8' });
      }
      break;
    }
  }
  const geometry = b.build();
  if (simple) bakeShade(geometry);
  return geometry;
}

/** Low preset: the props are drawn unlit, so a fixed key light is baked into the vertex colours instead. */
function bakeShade(geometry: BufferGeometry): void {
  const color = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal');
  // Light from above, slightly left and towards the holder.
  const lx = -0.36;
  const ly = 0.78;
  const lz = 0.51;
  for (let i = 0; i < color.count; i++) {
    const lit = Math.max(0, normal.getX(i) * lx + normal.getY(i) * ly + normal.getZ(i) * lz);
    const k = 0.6 + 0.4 * lit;
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
  color.needsUpdate = true;
}
