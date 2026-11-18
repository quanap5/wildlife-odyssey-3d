/**
 * Procedural animal models. Each body plan (quadruped, bird, fish, lizard ...)
 * is a parametric recipe that bakes a few vertex-coloured parts; species differ
 * only in parameters, so adding one needs no new code. Parts that move (legs,
 * neck, wings, tail) are separate meshes with pivots so they can be animated.
 */
import { Color, Group, Mesh, MeshStandardMaterial, type BufferGeometry, type Vector3, DoubleSide } from 'three';
import { GeoBuilder, cone, countershade, leaf, limb, sphere, type ColorFn } from '../../engine/rendering/geoBuilder';
import { getFoliageAtlas } from '../../engine/rendering/proceduralTextures';
import { hash2 } from '../../utils/rng';

export type RigKind = 'quadruped' | 'bird' | 'fish' | 'lizard' | 'toad' | 'butterfly' | 'bee' | 'dragonfly' | 'beetle';

export interface PartDef {
  name: string;
  geometry: BufferGeometry;
  pivot: [number, number, number];
}

export interface RigDef {
  kind: RigKind;
  parts: PartDef[];
  /** Targeting sphere radius (m, after scale). */
  radius: number;
  /** Height of the sphere centre above the feet (m, after scale). */
  centerY: number;
  scale: number;
  legLength: number;
  /** Baked body pitch for perching birds (rad). */
  upright: number;
  flapHz: number;
  hop: boolean;
}

const PI = Math.PI;
const c = (hex: string): Color => new Color(hex);

/** Direction of a +y limb after a 'YXZ' rotation, scaled to `len`. */
function dirOf(rx: number, ry: number, rz: number, len: number): [number, number, number] {
  const x0 = -Math.sin(rz);
  const y0 = Math.cos(rz) * Math.cos(rx);
  const z0 = Math.cos(rz) * Math.sin(rx);
  return [(x0 * Math.cos(ry) + z0 * Math.sin(ry)) * len, y0 * len, (-x0 * Math.sin(ry) + z0 * Math.cos(ry)) * len];
}

/* ------------------------------------------------------------------ */
/* Quadrupeds                                                          */
/* ------------------------------------------------------------------ */

interface QuadParams {
  len: number;
  w: number;
  r: number;
  leg: number;
  legR: number;
  neckLen: number;
  neckTilt: number;
  headLen: number;
  headR: number;
  ear: [number, number];
  tail: [number, number, number];
  back: string;
  belly: string;
  legColor: string;
  snout?: string;
  antlers?: number;
  tusks?: boolean;
  bushyTail?: string;
  mane?: boolean;
  earTip?: string;
  hind?: number;
  hop?: boolean;
  scale?: number;
}

function quadruped(p: QuadParams): RigDef {
  const cy = p.leg + p.r * 0.75;
  const shade = countershade(p.back, p.belly);
  const body = new GeoBuilder();
  body.add(sphere(1, 16, 12), { pos: [0, cy, 0], scale: [p.w, p.r, p.len / 2], color: shade, cell: 'fur', tile: 3 });
  body.add(sphere(1, 12, 10), { pos: [0, cy + p.r * 0.1, p.len * 0.26], scale: [p.w * 0.99, p.r * 1.04, p.len * 0.25], color: shade, cell: 'fur', tile: 2 });
  body.add(sphere(1, 12, 10), { pos: [0, cy + p.r * 0.06, -p.len * 0.27], scale: [p.w * 1.02, p.r * 1.02, p.len * 0.26], color: shade, cell: 'fur', tile: 2 });
  if (p.bushyTail) {
    const tl = p.tail[0];
    const pts: [number, number, number][] = [
      [cy + p.r * 0.5, -p.len / 2 - tl * 0.22, 0.85],
      [cy + p.r * 1.7, -p.len / 2 - tl * 0.42, 1.1],
      [cy + p.r * 3.0, -p.len / 2 - tl * 0.3, 1.0],
      [cy + p.r * 3.9, -p.len / 2 - tl * 0.05, 0.7],
    ];
    // Overlapping puffs along the curve, close enough together to read as one plume.
    const puffs = 9;
    for (let i = 0; i < puffs; i++) {
      const f = (i / (puffs - 1)) * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const u = f - k;
      const a0 = pts[k]!;
      const a1 = pts[k + 1]!;
      const y = a0[0] + (a1[0] - a0[0]) * u;
      const z = a0[1] + (a1[1] - a0[1]) * u;
      const sz = a0[2] + (a1[2] - a0[2]) * u;
      body.add(sphere(1, 8, 6), { pos: [0, y, z], scale: [p.tail[1] * sz, p.tail[1] * 1.15 * sz, p.tail[1] * 1.15 * sz], color: p.bushyTail, cell: 'fur', tile: 2 });
    }
  } else {
    body.add(limb(p.tail[1], p.tail[1] * 0.4, p.tail[0], 5), { pos: [0, cy + p.r * 0.4, -p.len * 0.48], rot: [-p.tail[2], 0, 0], color: p.back });
  }
  if (p.mane) {
    // A low ridge of longer, darker hair along the spine and the back of the neck.
    body.add(sphere(1, 8, 6), { pos: [0, cy + p.r * 0.93, p.len * 0.08], scale: [p.w * 0.16, p.r * 0.2, p.len * 0.36], color: c(p.back).offsetHSL(0, 0, -0.07), cell: 'fur', tile: 2 });
  }

  const neck = new GeoBuilder();
  const headColor = c(p.back).offsetHSL(0, 0, 0.02);
  neck.add(limb(p.r * 0.62, p.headR * 0.9, p.neckLen, 10), { rot: [p.neckTilt, 0, 0], color: shade, cell: 'fur', tile: 2 });
  const [, hy, hz] = dirOf(p.neckTilt, 0, 0, p.neckLen);
  neck.add(sphere(1, 10, 8), { pos: [0, hy, hz + p.headLen * 0.16], rot: [0.3, 0, 0], scale: [p.headR * 0.88, p.headR, p.headLen * 0.5], color: headColor, cell: 'fur', tile: 2 });
  neck.add(sphere(1, 8, 6), { pos: [0, hy - p.headR * 0.42, hz + p.headLen * 0.58], rot: [0.3, 0, 0], scale: [p.headR * 0.52, p.headR * 0.5, p.headLen * 0.3], color: p.snout ?? c(p.back).offsetHSL(0, 0, -0.07) });
  neck.add(sphere(p.headR * 0.2, 6, 5), { pos: [0, hy - p.headR * 0.5, hz + p.headLen * 0.86], color: '#1a1412' });
  for (const s of [-1, 1]) {
    neck.add(sphere(p.headR * 0.17, 8, 6), { pos: [s * p.headR * 0.74, hy + p.headR * 0.22, hz + p.headLen * 0.3], color: '#0d0b0a' });
    // Catchlight: the small highlight that makes an eye look alive.
    neck.add(sphere(p.headR * 0.05, 5, 4), { pos: [s * p.headR * 0.86, hy + p.headR * 0.29, hz + p.headLen * 0.34], color: '#ffffff' });
    const earPos: [number, number, number] = [s * p.headR * 0.62, hy + p.headR * 0.7, hz - p.headLen * 0.06];
    const earTipC = p.earTip ? c(p.earTip) : null;
    const earBase = c(p.back);
    neck.add(cone(p.ear[1], p.ear[0], 5), {
      pos: earPos,
      rot: [-0.3, 0, -s * (p.ear[0] > p.headLen ? 0.22 : 0.75)],
      scale: [1, 1, 0.45],
      color: (pt) => (earTipC && pt.y > earPos[1] + p.ear[0] * 0.62 ? earTipC : earBase),
    });
    if (p.antlers) {
      const L = p.antlers;
      const base: [number, number, number] = [s * p.headR * 0.42, hy + p.headR * 0.85, hz - p.headLen * 0.02];
      const bone = (pt: Vector3): Color => c('#6e5a44').lerp(c('#e2d6bc'), Math.min(1, (pt.y - base[1]) / (L * 0.8)));
      neck.add(limb(0.024, 0.01, L, 5), { pos: base, rot: [-0.55, 0, -s * 0.42], color: bone });
      neck.add(limb(0.016, 0.006, L * 0.34, 4), { pos: base, rot: [0.85, 0, -s * 0.3], color: bone });
      const d = dirOf(-0.55, 0, -s * 0.42, L * 0.6);
      neck.add(limb(0.014, 0.006, L * 0.42, 4), { pos: [base[0] + d[0], base[1] + d[1], base[2] + d[2]], rot: [0.5, 0, -s * 0.2], color: bone });
    }
    if (p.tusks) {
      neck.add(cone(p.headR * 0.1, p.headR * 0.55, 4), { pos: [s * p.headR * 0.42, hy - p.headR * 0.62, hz + p.headLen * 0.6], rot: [0.2, 0, -s * 0.55], color: '#efe6cf' });
    }
  }

  const legTop = p.leg + p.r * 0.2;
  const hoof = c('#1f1915');
  const lower = c(p.legColor);
  const upper = c(p.back);
  // Two-segment legs: a muscled upper leg, a joint, a slender cannon and a hoof.
  // Hind legs carry the backward-pointing hock of a real ungulate or carnivore.
  const makeLeg = (thick: number, hind: boolean): BufferGeometry => {
    const g = new GeoBuilder();
    const L = legTop;
    const kneeY = -L * (hind ? 0.52 : 0.47);
    const kneeZ = hind ? -L * 0.14 : L * 0.045;
    const footZ = hind ? L * 0.03 : 0;
    const upLen = Math.hypot(kneeY, kneeZ);
    g.add(limb(p.legR * 0.85 * thick, p.legR * 1.75 * thick, upLen, 7), { pos: [0, kneeY, kneeZ], rot: [Math.atan2(-kneeZ, -kneeY), 0, 0], color: upper, cell: 'fur', tile: 2 });
    g.add(sphere(p.legR * 0.9 * thick, 7, 5), { pos: [0, kneeY, kneeZ], color: upper });
    const lowLen = Math.hypot(kneeY + L, kneeZ - footZ);
    g.add(limb(p.legR * 0.56 * thick, p.legR * 0.8 * thick, lowLen, 6), { pos: [0, -L, footZ], rot: [Math.atan2(kneeZ - footZ, kneeY + L), 0, 0], color: (pt) => (pt.y < -L * 0.9 ? hoof : lower) });
    g.add(limb(p.legR * 0.8 * thick, p.legR * 0.62 * thick, L * 0.07, 6), { pos: [0, -L, footZ + p.legR * 0.2], color: hoof });
    return g.build();
  };
  const parts: PartDef[] = [
    { name: 'body', geometry: body.build(), pivot: [0, 0, 0] },
    { name: 'neck', geometry: neck.build(), pivot: [0, cy + p.r * 0.35, p.len * 0.39] },
    { name: 'legFL', geometry: makeLeg(1, false), pivot: [p.w * 0.62, legTop, p.len * 0.33] },
    { name: 'legFR', geometry: makeLeg(1, false), pivot: [-p.w * 0.62, legTop, p.len * 0.33] },
    { name: 'legBL', geometry: makeLeg(p.hind ?? 1.15, true), pivot: [p.w * 0.62, legTop, -p.len * 0.33] },
    { name: 'legBR', geometry: makeLeg(p.hind ?? 1.15, true), pivot: [-p.w * 0.62, legTop, -p.len * 0.33] },
  ];
  const scale = p.scale ?? 1;
  return { kind: 'quadruped', parts, radius: Math.max(p.len * 0.62, cy * 0.6) * scale, centerY: cy * scale, scale, legLength: legTop, upright: 0, flapHz: 0, hop: Boolean(p.hop) };
}

/* ------------------------------------------------------------------ */
/* Birds                                                               */
/* ------------------------------------------------------------------ */

interface BirdParams {
  len: number;
  r: number;
  neck: number;
  headR: number;
  bill: [number, number, string];
  leg: [number, string];
  tail: [number, number, string];
  span: number;
  chord: number;
  body: string;
  belly: string;
  head: string;
  wing: string;
  upright: number;
  flapHz: number;
  wingBand?: string;
  tailBand?: string;
  crest?: [number, string];
  casque?: string;
  comb?: string;
  cheek?: string;
  vent?: string;
  sNeck?: boolean;
  feet?: string;
  sickleTail?: boolean;
  scale?: number;
}

function bird(p: BirdParams): RigDef {
  const legH = p.leg[0];
  const cy = legH + p.r;
  const b = new GeoBuilder();
  b.add(sphere(1, 12, 9), { pos: [0, cy, 0], rot: [-p.upright, 0, 0], scale: [p.r * 0.92, p.r, p.len / 2], color: countershade(p.body, p.belly, 1.6), cell: 'fur', tile: 3 });
  const nb: [number, number, number] = [0, cy + Math.sin(p.upright) * p.len * 0.34 + p.r * 0.35, Math.cos(p.upright) * p.len * 0.36];
  let tip: [number, number, number];
  if (p.sNeck) {
    const d1 = dirOf(-0.35, 0, 0, p.neck * 0.5);
    b.add(limb(p.r * 0.38, p.headR * 0.62, p.neck * 0.5, 6), { pos: nb, rot: [-0.35, 0, 0], color: p.body });
    const mid: [number, number, number] = [nb[0] + d1[0], nb[1] + d1[1], nb[2] + d1[2]];
    const d2 = dirOf(0.55, 0, 0, p.neck * 0.55);
    b.add(limb(p.headR * 0.62, p.headR * 0.55, p.neck * 0.55, 6), { pos: mid, rot: [0.55, 0, 0], color: p.body });
    tip = [mid[0] + d2[0], mid[1] + d2[1], mid[2] + d2[2]];
  } else {
    const d = dirOf(0.4, 0, 0, p.neck);
    b.add(limb(p.r * 0.6, p.headR * 0.8, p.neck, 6), { pos: nb, rot: [0.4, 0, 0], color: p.head });
    tip = [nb[0] + d[0], nb[1] + d[1], nb[2] + d[2]];
  }
  b.add(sphere(p.headR, 10, 8), { pos: tip, color: p.head });
  b.add(cone(p.bill[1], p.bill[0], 6), { pos: [0, tip[1] - p.headR * 0.1, tip[2] + p.headR * 0.75], rot: [PI / 2 + (p.casque ? 0.28 : 0.05), 0, 0], scale: [0.8, 1, 1], color: p.bill[2] });
  if (p.casque) {
    b.add(sphere(1, 8, 6), { pos: [0, tip[1] + p.headR * 0.85, tip[2] + p.headR * 0.9], scale: [p.headR * 0.55, p.headR * 0.5, p.headR * 1.5], color: p.casque });
  }
  for (const s of [-1, 1]) {
    b.add(sphere(p.headR * 0.17, 7, 6), { pos: [s * p.headR * 0.82, tip[1] + p.headR * 0.18, tip[2] + p.headR * 0.42], color: '#0b0a09' });
    b.add(sphere(p.headR * 0.055, 5, 4), { pos: [s * p.headR * 0.95, tip[1] + p.headR * 0.25, tip[2] + p.headR * 0.47], color: '#ffffff' });
    if (p.cheek) b.add(sphere(p.headR * 0.3, 6, 5), { pos: [s * p.headR * 0.8, tip[1] - p.headR * 0.25, tip[2] + p.headR * 0.1], scale: [0.4, 1, 1], color: p.cheek });
    b.add(limb(p.r * 0.07 + 0.002, p.r * 0.06 + 0.002, legH + p.r * 0.35, 4), { pos: [s * p.r * 0.36, 0, -p.len * 0.03], color: p.leg[1] });
    b.add(sphere(1, 6, 4), { pos: [s * p.r * 0.36, p.r * 0.05, p.r * 0.2], scale: [p.r * 0.16, p.r * 0.06, p.r * 0.42], color: p.feet ?? p.leg[1] });
  }
  if (p.crest) b.add(cone(p.headR * 0.5, p.crest[0], 5), { pos: [0, tip[1] + p.headR * 0.7, tip[2] - p.headR * 0.2], rot: [-0.35, 0, 0], scale: [0.6, 1, 1], color: p.crest[1] });
  if (p.comb) {
    b.add(sphere(1, 8, 6), { pos: [0, tip[1] + p.headR * 1.0, tip[2] + p.headR * 0.15], scale: [p.headR * 0.14, p.headR * 0.55, p.headR * 0.85], color: p.comb });
    b.add(sphere(1, 6, 5), { pos: [0, tip[1] - p.headR * 0.95, tip[2] + p.headR * 0.5], scale: [p.headR * 0.12, p.headR * 0.42, p.headR * 0.3], color: p.comb });
  }
  if (p.vent) b.add(sphere(p.r * 0.38, 6, 5), { pos: [0, cy - p.r * 0.55, -p.len * 0.36], color: p.vent });
  const tailBase: [number, number, number] = [0, cy - Math.sin(p.upright) * p.len * 0.36, -Math.cos(p.upright) * p.len * 0.42];
  const tailCol = c(p.tail[2]);
  const bandCol = p.tailBand ? c(p.tailBand) : null;
  if (p.sickleTail) {
    for (let i = 0; i < 5; i++) {
      b.add(leaf(p.tail[0] * (0.7 + i * 0.09), p.tail[1] * 0.55, 5, 0.9, 0), { pos: tailBase, rot: [-0.95 + i * 0.07, PI + (i - 2) * 0.12, 0], color: p.tail[2] });
    }
  } else {
    b.add(leaf(p.tail[0], p.tail[1], 4, 0.05, 0), {
      pos: tailBase,
      rot: [0.12 + p.upright * 0.7, PI, 0],
      color: (pt) => {
        const t = Math.hypot(pt.z - tailBase[2], pt.y - tailBase[1]) / p.tail[0];
        return bandCol && t > 0.5 && t < 0.78 ? bandCol : tailCol;
      },
    });
  }
  const wingCol = c(p.wing);
  const wingTip = c(p.wing).offsetHSL(0, 0, -0.06);
  const band = p.wingBand ? c(p.wingBand) : null;
  const half = p.span / 2;
  const wingColor: ColorFn = (pt) => {
    const t = Math.abs(pt.x) / half;
    if (band && t > 0.48 && t < 0.7) return band;
    return t > 0.75 ? wingTip : wingCol;
  };
  const wing = (s: number): BufferGeometry => new GeoBuilder().add(leaf(half, p.chord, 6, 0.02, 0), { rot: [0, (s * PI) / 2, 0], color: wingColor }).build();
  const scale = p.scale ?? 1;
  return {
    kind: 'bird',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'wingL', geometry: wing(1), pivot: [p.r * 0.7, cy + p.r * 0.45, p.len * 0.06] },
      { name: 'wingR', geometry: wing(-1), pivot: [-p.r * 0.7, cy + p.r * 0.45, p.len * 0.06] },
    ],
    radius: Math.max(p.len * 0.75, cy * 0.6, p.span * 0.2) * scale,
    centerY: cy * scale,
    scale,
    legLength: legH,
    upright: p.upright,
    flapHz: p.flapHz,
    hop: false,
  };
}

/* ------------------------------------------------------------------ */
/* Fish                                                                */
/* ------------------------------------------------------------------ */

interface FishParams {
  len: number;
  h: number;
  w: number;
  back: string;
  belly: string;
  fin: string;
  band?: string;
  spots?: boolean;
  dorsal: [number, number];
  threads?: boolean;
  barbels?: boolean;
  scale?: number;
}

function fish(p: FishParams): RigDef {
  const b = new GeoBuilder();
  const back = c(p.back);
  const belly = c(p.belly);
  const band = p.band ? c(p.band) : null;
  const spot = c('#14181c');
  b.add(sphere(1, 16, 10), {
    scale: [p.w, p.h, p.len / 2],
    cell: 'scale',
    tile: 4,
    deform: (v) => {
      if (v.z < 0) {
        const k = 1 - 0.62 * Math.pow(-v.z, 1.6);
        v.x *= k;
        v.y *= k;
      } else if (v.z > 0.45) {
        const k = 1 - 0.4 * ((v.z - 0.45) / 0.55) ** 2;
        v.x *= k;
        v.y *= k;
      }
    },
    color: (pt, n) => {
      const t = Math.min(1, Math.max(0, 0.5 - n.y * 0.9));
      const col = back.clone().lerp(belly, t);
      if (band) {
        const stripe = Math.sin(pt.z * (38 / p.len)) * 0.5 + 0.5;
        if (n.y > -0.2 && stripe > 0.62) col.lerp(band, 0.55);
      }
      if (p.spots && Math.abs(pt.y) < p.h * 0.35 && (Math.abs(pt.z - p.len * 0.02) < p.len * 0.06 || Math.abs(pt.z + p.len * 0.3) < p.len * 0.05)) return spot;
      return col;
    },
  });
  for (const s of [-1, 1]) {
    b.add(sphere(p.w * 0.2, 7, 6), { pos: [s * p.w * 0.74, p.h * 0.22, p.len * 0.36], color: '#0a0c0e' });
    b.add(sphere(p.w * 0.06, 5, 4), { pos: [s * p.w * 0.9, p.h * 0.3, p.len * 0.375], color: '#ffffff' });
    b.add(leaf(p.len * 0.16, p.h * 0.5, 3), { pos: [s * p.w * 0.85, -p.h * 0.25, p.len * 0.2], rot: [0.5, s * 2.3, 0], color: p.fin });
    if (p.threads) b.add(limb(p.w * 0.06, p.w * 0.03, p.len * 0.7, 3), { pos: [s * p.w * 0.4, -p.h * 0.6, p.len * 0.18], rot: [-2.0, 0, 0], color: p.fin });
    if (p.barbels) b.add(limb(p.w * 0.05, p.w * 0.02, p.len * 0.06, 3), { pos: [s * p.w * 0.3, -p.h * 0.3, p.len * 0.47], rot: [2.4, 0, -s * 0.5], color: p.fin });
  }
  b.add(leaf(p.len * p.dorsal[0], p.h * p.dorsal[1] * 2, 4), { pos: [0, p.h * 0.72, -p.len * 0.3], rot: [0, 0, PI / 2], color: p.fin });
  b.add(leaf(p.len * 0.26, p.h * 0.9, 3), { pos: [0, -p.h * 0.7, -p.len * 0.32], rot: [0, 0, PI / 2], color: p.fin });
  const tail = new GeoBuilder().add(cone(p.h * 1.05, p.len * 0.24, 6), { pos: [0, 0, -p.len * 0.24], rot: [PI / 2, 0, 0], scale: [0.1, 1, 1], color: p.fin }).build();
  const scale = p.scale ?? 1;
  return {
    kind: 'fish',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'tail', geometry: tail, pivot: [0, 0, -p.len * 0.44] },
    ],
    radius: p.len * 0.6 * scale,
    centerY: 0,
    scale,
    legLength: 0,
    upright: 0,
    flapHz: 0,
    hop: false,
  };
}

/* ------------------------------------------------------------------ */
/* Reptiles and amphibians                                             */
/* ------------------------------------------------------------------ */

interface LizardParams {
  len: number;
  w: number;
  h: number;
  tail: number;
  leg: number;
  back: string;
  belly: string;
  head: string;
  crest?: number;
  bands?: string;
  scale?: number;
}

function lizard(p: LizardParams): RigDef {
  const lift = p.leg * 0.55;
  const cy = p.h + lift;
  const b = new GeoBuilder();
  b.add(sphere(1, 12, 8), { pos: [0, cy, 0], scale: [p.w, p.h, p.len / 2], color: countershade(p.back, p.belly), cell: 'scale', tile: 3 });
  b.add(sphere(1, 10, 8), { pos: [0, cy + p.h * 0.45, p.len * 0.6], scale: [p.w * 0.85, p.h * 0.9, p.len * 0.24], color: p.head });
  for (const s of [-1, 1]) {
    b.add(sphere(p.w * 0.2, 6, 5), { pos: [s * p.w * 0.66, cy + p.h * 0.75, p.len * 0.66], color: '#0c0b0a' });
    b.add(sphere(p.w * 0.06, 5, 4), { pos: [s * p.w * 0.8, cy + p.h * 0.83, p.len * 0.675], color: '#ffffff' });
    for (const z of [0.3, -0.32]) {
      const d = dirOf(0, 0, -s * 2.05, p.leg);
      b.add(limb(p.w * 0.3, p.w * 0.18, p.leg, 5), { pos: [s * p.w * 0.7, cy, p.len * z], rot: [0, 0, -s * 2.05], color: p.back });
      b.add(sphere(1, 5, 4), { pos: [s * p.w * 0.7 + d[0], Math.max(0.004, cy + d[1]), p.len * z + p.w * 0.3], scale: [p.w * 0.3, p.w * 0.1, p.w * 0.5], color: p.back });
    }
  }
  if (p.crest) {
    for (let i = 0; i < 9; i++) {
      b.add(cone(p.w * 0.14, p.crest * (i < 3 ? 1.3 : 0.8), 4), { pos: [0, cy + p.h * 0.85, p.len * (0.52 - i * 0.12)], rot: [-0.25, 0, 0], scale: [0.35, 1, 1], color: c(p.back).offsetHSL(0, 0, -0.07) });
    }
  }
  const tailBase = c(p.back);
  const bands = p.bands ? c(p.bands) : null;
  const tail = new GeoBuilder()
    .add(cone(p.w * 0.6, p.tail, 6), {
      rot: [-PI / 2 - 0.1, 0, 0],
      color: (pt) => (bands && Math.floor((-pt.z / p.tail) * 9) % 2 === 1 ? bands : tailBase),
    })
    .build();
  const scale = p.scale ?? 1;
  return {
    kind: 'lizard',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'tail', geometry: tail, pivot: [0, cy, -p.len * 0.44] },
    ],
    radius: (p.len * 0.7 + p.tail * 0.25) * scale,
    centerY: cy * scale,
    scale,
    legLength: p.leg,
    upright: 0,
    flapHz: 0,
    hop: false,
  };
}

function toad(): RigDef {
  const b = new GeoBuilder();
  const base = c('#7a6446');
  const dark = c('#3f3323');
  const belly = c('#c9bd9c');
  const warty: ColorFn = (pt, n) => {
    if (n.y < -0.3) return belly;
    const k = hash2(Math.round(pt.x * 260), Math.round(pt.z * 260) + Math.round(pt.y * 131));
    return k > 0.72 ? dark : base;
  };
  b.add(sphere(1, 14, 10), { pos: [0, 0.034, 0], scale: [0.042, 0.032, 0.05], color: warty });
  b.add(sphere(1, 10, 8), { pos: [0, 0.042, 0.04], scale: [0.032, 0.022, 0.026], color: warty });
  for (const s of [-1, 1]) {
    b.add(sphere(0.008, 6, 5), { pos: [s * 0.019, 0.06, 0.046], color: '#16120c' });
    b.add(sphere(1, 6, 5), { pos: [s * 0.026, 0.052, 0.026], scale: [0.008, 0.006, 0.014], color: dark });
    b.add(sphere(1, 8, 6), { pos: [s * 0.042, 0.018, -0.03], scale: [0.02, 0.016, 0.032], color: warty });
    b.add(limb(0.008, 0.006, 0.034, 4), { pos: [s * 0.03, 0.03, 0.03], rot: [0.5, 0, -s * 2.6], color: base });
  }
  return { kind: 'toad', parts: [{ name: 'body', geometry: b.build(), pivot: [0, 0, 0] }], radius: 0.085, centerY: 0.04, scale: 1.25, legLength: 0.03, upright: 0, flapHz: 0, hop: true };
}

/* ------------------------------------------------------------------ */
/* Insects                                                             */
/* ------------------------------------------------------------------ */

function butterfly(pattern: (d: number, a: number) => Color, bodyColor: string, fw: number, scale: number): RigDef {
  const b = new GeoBuilder();
  b.add(sphere(1, 8, 6), { scale: [0.0035, 0.0035, fw * 0.42], color: bodyColor });
  b.add(sphere(0.0042, 6, 5), { pos: [0, 0.001, fw * 0.44], color: bodyColor });
  for (const s of [-1, 1]) b.add(limb(0.0004, 0.0003, fw * 0.4, 3), { pos: [s * 0.001, 0.002, fw * 0.46], rot: [0.9, s * 0.35, 0], color: '#111' });
  const wing = (s: number): BufferGeometry => {
    const g = new GeoBuilder();
    const paint: ColorFn = (pt) => pattern(Math.hypot(pt.x, pt.z) / fw, Math.atan2(pt.z, Math.abs(pt.x)));
    g.add(leaf(fw, fw * 0.66, 7), { rot: [0, s * 1.12, 0], color: paint });
    g.add(leaf(fw * 0.78, fw * 0.74, 7), { rot: [0, s * 2.1, 0], color: paint });
    return g.build();
  };
  return {
    kind: 'butterfly',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'wingL', geometry: wing(1), pivot: [0.002, 0.002, 0] },
      { name: 'wingR', geometry: wing(-1), pivot: [-0.002, 0.002, 0] },
    ],
    radius: fw * 1.25 * scale,
    centerY: 0,
    scale,
    legLength: 0,
    upright: 0,
    flapHz: 7,
    hop: false,
  };
}

const LIME_BLACK = c('#15130f');
const LIME_YELLOW = c('#f0e486');
function limePattern(d: number, a: number): Color {
  if (d < 0.2) return LIME_YELLOW;
  if (d > 0.36 && d < 0.56) return LIME_YELLOW;
  if (d > 0.72 && d < 0.86 && Math.sin(a * 11) > 0) return LIME_YELLOW;
  return LIME_BLACK;
}
const TIGER_ORANGE = c('#e0741a');
const TIGER_BLACK = c('#17120e');
const TIGER_WHITE = c('#f4f1e8');
function tigerPattern(d: number, a: number): Color {
  if (d > 0.84) return Math.sin(a * 19) > 0.55 ? TIGER_WHITE : TIGER_BLACK;
  if (Math.abs(Math.sin(a * 6.5)) < 0.2 && d > 0.25) return TIGER_BLACK;
  return TIGER_ORANGE;
}

function bee(): RigDef {
  const b = new GeoBuilder();
  const yellow = c('#d9a02c');
  const black = c('#1d1710');
  b.add(sphere(1, 8, 6), { pos: [0, 0, 0.004], scale: [0.0028, 0.0028, 0.0034], color: '#5a4320' });
  b.add(sphere(0.0022, 6, 5), { pos: [0, 0, 0.0085], color: black });
  b.add(sphere(1, 10, 8), { pos: [0, -0.0004, -0.0036], scale: [0.0028, 0.0027, 0.0052], color: (pt) => (Math.floor((pt.z + 0.02) * 900) % 2 === 0 ? yellow : black) });
  const wing = (s: number): BufferGeometry => new GeoBuilder().add(leaf(0.0085, 0.0034, 3), { rot: [0, s * 2.0, 0], color: '#dfe6ea' }).build();
  return {
    kind: 'bee',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'wingL', geometry: wing(1), pivot: [0.0015, 0.0022, 0.003] },
      { name: 'wingR', geometry: wing(-1), pivot: [-0.0015, 0.0022, 0.003] },
    ],
    radius: 0.05,
    centerY: 0,
    scale: 3,
    legLength: 0,
    upright: 0,
    flapHz: 40,
    hop: false,
  };
}

function dragonfly(): RigDef {
  const b = new GeoBuilder();
  const red = '#d2261c';
  b.add(sphere(1, 8, 6), { pos: [0, 0, 0.004], scale: [0.0038, 0.0038, 0.006], color: red });
  b.add(sphere(0.0038, 8, 6), { pos: [0, 0.0004, 0.0115], color: '#8a1f16' });
  for (const s of [-1, 1]) b.add(sphere(0.0024, 6, 5), { pos: [s * 0.0024, 0.0012, 0.0128], color: '#5a140e' });
  b.add(limb(0.0021, 0.0015, 0.028, 5), { pos: [0, 0, -0.001], rot: [-PI / 2, 0, 0], color: red });
  const wing = (s: number): BufferGeometry => {
    const g = new GeoBuilder();
    g.add(leaf(0.034, 0.009, 4), { pos: [0, 0, 0.003], rot: [0, s * 1.48, 0], color: '#e6ecee' });
    g.add(leaf(0.032, 0.011, 4), { pos: [0, 0, -0.003], rot: [0, s * 1.68, 0], color: '#e9d9c4' });
    return g.build();
  };
  return {
    kind: 'dragonfly',
    parts: [
      { name: 'body', geometry: b.build(), pivot: [0, 0, 0] },
      { name: 'wingL', geometry: wing(1), pivot: [0.002, 0.003, 0.004] },
      { name: 'wingR', geometry: wing(-1), pivot: [-0.002, 0.003, 0.004] },
    ],
    radius: 0.075,
    centerY: 0,
    scale: 1.8,
    legLength: 0,
    upright: 0,
    flapHz: 30,
    hop: false,
  };
}

function rhinoBeetle(): RigDef {
  const b = new GeoBuilder();
  const shell = c('#3b1c10');
  const dark = c('#1a0d08');
  b.add(sphere(1, 12, 9), { pos: [0, 0.011, -0.006], scale: [0.0125, 0.0105, 0.019], color: (_p, n) => shell.clone().lerp(c('#7a3a1c'), Math.max(0, n.y) * 0.5) });
  b.add(sphere(1, 10, 8), { pos: [0, 0.0105, 0.014], scale: [0.0105, 0.0085, 0.009], color: dark });
  b.add(sphere(0.0048, 8, 6), { pos: [0, 0.008, 0.023], color: dark });
  // Thoracic horn (forward) and cephalic horn (curving up), both forked at the tip.
  b.add(limb(0.0022, 0.0014, 0.02, 5), { pos: [0, 0.016, 0.018], rot: [1.25, 0, 0], color: dark });
  b.add(limb(0.002, 0.0013, 0.017, 5), { pos: [0, 0.009, 0.026], rot: [0.75, 0, 0], color: dark });
  for (const s of [-1, 1]) {
    b.add(limb(0.0013, 0.0008, 0.005, 4), { pos: [0, 0.0222, 0.037], rot: [0.9, 0, -s * 0.7], color: dark });
    b.add(limb(0.0012, 0.0008, 0.0045, 4), { pos: [0, 0.0214, 0.0376], rot: [0.3, 0, -s * 0.7], color: dark });
    for (const z of [0.014, 0.002, -0.012]) {
      b.add(limb(0.0012, 0.0008, 0.014, 4), { pos: [s * 0.009, 0.008, z], rot: [0, 0, -s * 2.0], color: dark });
    }
  }
  return { kind: 'beetle', parts: [{ name: 'body', geometry: b.build(), pivot: [0, 0, 0] }], radius: 0.07, centerY: 0.02, scale: 1.5, legLength: 0.006, upright: 0, flapHz: 0, hop: false };
}

/* ------------------------------------------------------------------ */
/* Species recipes                                                     */
/* ------------------------------------------------------------------ */

const RECIPES: Record<string, (variant: number) => RigDef> = {
  sambar: (v) =>
    quadruped({ len: 1.55, w: 0.27, r: 0.3, leg: 0.82, legR: 0.05, neckLen: 0.55, neckTilt: 0.72, headLen: 0.34, headR: 0.11, ear: [0.17, 0.06], tail: [0.28, 0.035, 2.75], back: '#5b4433', belly: '#7e6853', legColor: '#3d2e23', antlers: v === 0 ? 0.62 : undefined, mane: v === 0, scale: v === 0 ? 1.05 : 0.93 }),
  muntjac: (v) =>
    quadruped({ len: 0.86, w: 0.15, r: 0.17, leg: 0.42, legR: 0.028, neckLen: 0.27, neckTilt: 0.7, headLen: 0.2, headR: 0.07, ear: [0.09, 0.04], tail: [0.15, 0.03, 2.5], back: '#a55a2f', belly: '#dcb891', legColor: '#5a3320', antlers: v === 0 ? 0.15 : undefined }),
  boar: () =>
    quadruped({ len: 1.25, w: 0.26, r: 0.29, leg: 0.4, legR: 0.05, neckLen: 0.17, neckTilt: 1.25, headLen: 0.44, headR: 0.15, ear: [0.1, 0.06], tail: [0.24, 0.014, 2.9], back: '#3c3531', belly: '#51463e', legColor: '#27211d', snout: '#5b4a42', tusks: true, mane: true }),
  hare: () =>
    quadruped({ len: 0.44, w: 0.085, r: 0.095, leg: 0.15, legR: 0.018, neckLen: 0.07, neckTilt: 0.45, headLen: 0.11, headR: 0.05, ear: [0.13, 0.026], tail: [0.05, 0.028, 2.2], back: '#8c7b62', belly: '#ebe5d6', legColor: '#9c8a70', earTip: '#16120e', hind: 1.9, hop: true }),
  squirrel: () =>
    quadruped({ len: 0.24, w: 0.045, r: 0.05, leg: 0.055, legR: 0.01, neckLen: 0.035, neckTilt: 0.6, headLen: 0.07, headR: 0.032, ear: [0.022, 0.014], tail: [0.24, 0.036, 0], back: '#625c3c', belly: '#a8472b', legColor: '#5a5236', bushyTail: '#6a6344', hind: 1.6, hop: true }),
  junglefowl: (v) =>
    v === 0
      ? bird({ len: 0.38, r: 0.115, neck: 0.13, headR: 0.045, bill: [0.035, 0.014, '#b9a26a'], leg: [0.14, '#6a6a72'], tail: [0.36, 0.09, '#12271f'], span: 0.62, chord: 0.2, body: '#7b2d17', belly: '#1c1a17', head: '#e39a30', wing: '#6a2a16', upright: 0.35, flapHz: 7, comb: '#d5202a', sickleTail: true })
      : bird({ len: 0.32, r: 0.1, neck: 0.1, headR: 0.04, bill: [0.03, 0.012, '#b9a26a'], leg: [0.11, '#6a6a72'], tail: [0.14, 0.09, '#5a4630'], span: 0.52, chord: 0.18, body: '#8a6b47', belly: '#b89a72', head: '#9a7446', wing: '#7a5d3d', upright: 0.3, flapHz: 7 }),
  kingfisher: () =>
    bird({ len: 0.13, r: 0.038, neck: 0.012, headR: 0.03, bill: [0.045, 0.008, '#1c1c1f'], leg: [0.014, '#d2452a'], tail: [0.035, 0.035, '#1c62b0'], span: 0.25, chord: 0.075, body: '#1f84d6', belly: '#e27f2c', head: '#1b73c4', wing: '#1767b0', upright: 0.75, flapHz: 12, cheek: '#f0e8dc' }),
  egret: () =>
    bird({ len: 0.34, r: 0.085, neck: 0.3, headR: 0.034, bill: [0.09, 0.011, '#17171a'], leg: [0.3, '#17171a'], tail: [0.1, 0.09, '#f7f6f1'], span: 0.95, chord: 0.26, body: '#f7f6f1', belly: '#ffffff', head: '#f7f6f1', wing: '#f3f2ec', upright: 0.45, flapHz: 3, sNeck: true, feet: '#e6c62e' }),
  bulbul: () =>
    bird({ len: 0.13, r: 0.036, neck: 0.012, headR: 0.026, bill: [0.016, 0.006, '#1a1a1a'], leg: [0.028, '#2a2622'], tail: [0.09, 0.04, '#5a4838'], span: 0.27, chord: 0.085, body: '#6d5642', belly: '#efe9dd', head: '#16130f', wing: '#5f4a39', upright: 0.6, flapHz: 10, crest: [0.04, '#16130f'], cheek: '#d8252b', vent: '#d83a2b' }),
  hornbill: () =>
    bird({ len: 0.62, r: 0.17, neck: 0.16, headR: 0.085, bill: [0.27, 0.05, '#efc23a'], leg: [0.08, '#3c3b34'], tail: [0.46, 0.2, '#f4f1e6'], span: 1.5, chord: 0.42, body: '#141414', belly: '#1c1c1c', head: '#e8dca0', wing: '#121212', upright: 0.5, flapHz: 2.6, wingBand: '#f1ecda', tailBand: '#121212', casque: '#f0b32e' }),
  eagle: () =>
    bird({ len: 0.5, r: 0.13, neck: 0.04, headR: 0.06, bill: [0.045, 0.02, '#d9c24a'], leg: [0.07, '#d9c24a'], tail: [0.26, 0.2, '#2a2019'], span: 1.45, chord: 0.42, body: '#4a3626', belly: '#6d5238', head: '#241a14', wing: '#3a2a1e', upright: 0.3, flapHz: 0.5, wingBand: '#efe9da', tailBand: '#efe9da', crest: [0.05, '#16110d'] }),
  snakehead: () => fish({ len: 0.5, h: 0.045, w: 0.04, back: '#2d2b22', belly: '#c9c2a4', fin: '#3c382b', band: '#15140f', dorsal: [0.6, 0.45] }),
  barb: () => fish({ len: 0.26, h: 0.055, w: 0.02, back: '#8fa0a0', belly: '#f1f3ee', fin: '#d9a44a', dorsal: [0.22, 0.8], barbels: true }),
  gourami: () => fish({ len: 0.12, h: 0.03, w: 0.011, back: '#6f93a8', belly: '#cfdde0', fin: '#9db7bf', spots: true, dorsal: [0.24, 0.6], threads: true, scale: 1.25 }),
  gardenLizard: () => lizard({ len: 0.1, w: 0.014, h: 0.013, tail: 0.24, leg: 0.03, back: '#8a7650', belly: '#d8cba8', head: '#b5532c', crest: 0.008, scale: 1.15 }),
  waterDragon: () => lizard({ len: 0.24, w: 0.03, h: 0.03, tail: 0.56, leg: 0.075, back: '#3f9a3c', belly: '#cfe3a8', head: '#4aa844', crest: 0.022, bands: '#2a5a2c' }),
  toad,
  limeButterfly: () => butterfly(limePattern, '#14110d', 0.046, 1.7),
  tigerButterfly: () => butterfly(tigerPattern, '#17120e', 0.042, 1.7),
  bee,
  dragonfly,
  rhinoBeetle,
};

const rigCache = new Map<string, RigDef>();

export function hasVariants(model: string): boolean {
  return model === 'sambar' || model === 'muntjac' || model === 'junglefowl';
}

export function getRigDef(model: string, variant = 0): RigDef {
  const v = hasVariants(model) ? variant % 2 : 0;
  const key = `${model}:${v}`;
  let def = rigCache.get(key);
  if (!def) {
    const recipe = RECIPES[model];
    if (!recipe) throw new Error(`No animal model recipe for "${model}"`);
    def = recipe(v);
    rigCache.set(key, def);
  }
  return def;
}

export const ANIMAL_MODELS = Object.keys(RECIPES);

/** Sky-light colour for the rim term, set once a frame by the sky. */
export const animalUniforms = { uRim: { value: new Color(0.5, 0.55, 0.6) } };

let sharedMaterial: MeshStandardMaterial | null = null;
export function getAnimalMaterial(): MeshStandardMaterial {
  if (!sharedMaterial) {
    // The atlas adds coat and scale grain; parts without a cell sample its plain white cell.
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02, side: DoubleSide, map: getFoliageAtlas() });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = animalUniforms.uRim;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
        .replace(
          '#include <opaque_fragment>',
          `// Soft light wrapping round the silhouette: fur and feathers catch the sky at grazing angles.
float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
outgoingLight += diffuseColor.rgb * uRim * rim;
#include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'animal-v2';
    sharedMaterial = mat;
  }
  return sharedMaterial;
}

export interface RigInstance {
  def: RigDef;
  /** Positioned and oriented by the simulation. */
  root: Group;
  /** Child used for pose offsets (bob, pitch, bank). */
  inner: Group;
  parts: Record<string, Mesh>;
  phase: number;
  neck: number;
  crouch: number;
  fold: number;
}

export function createRig(def: RigDef, castShadow = true): RigInstance {
  const root = new Group();
  const inner = new Group();
  root.add(inner);
  root.scale.setScalar(def.scale);
  const parts: Record<string, Mesh> = {};
  const mat = getAnimalMaterial();
  for (const part of def.parts) {
    const mesh = new Mesh(part.geometry, mat);
    mesh.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    mesh.castShadow = castShadow && def.radius > 0.15;
    inner.add(mesh);
    parts[part.name] = mesh;
  }
  return { def, root, inner, parts, phase: Math.random() * 6, neck: 0, crouch: 0, fold: 1 };
}

export function disposeRigCache(): void {
  for (const def of rigCache.values()) for (const p of def.parts) p.geometry.dispose();
  rigCache.clear();
  sharedMaterial?.dispose();
  sharedMaterial = null;
}
