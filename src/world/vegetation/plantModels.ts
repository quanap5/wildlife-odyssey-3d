/**
 * Procedural plant models. Each species is modelled from its real growth form
 * (buttressed dipterocarp, clumping bamboo, fishtail palm, strangler fig ...).
 * `PLANT_META` is pure data (used by placement, physics and targeting);
 * geometry is only built when the renderer asks for it.
 */
import { CylinderGeometry, type BufferGeometry, Color, type ColorRepresentation, type Vector3 } from 'three';
import { GeoBuilder, blade, blob, cone, crossCards, foliage, frond, gradient, leaf, limb, sphere, type ColorFn } from '../../engine/rendering/geoBuilder';
import type { AtlasCell } from '../../engine/rendering/proceduralTextures';
import { mulberry32 } from '../../utils/rng';

export type PlantKind = 'tree' | 'understory' | 'aquatic' | 'rock';

export interface PlantMeta {
  kind: PlantKind;
  /** Unscaled height in metres. */
  height: number;
  /** Interaction / targeting sphere radius (unscaled). */
  radius: number;
  /** Height of the targeting sphere centre (unscaled). */
  centerY: number;
  /** Trunk collision radius (0 = walk-through). */
  trunkRadius: number;
  scale: [number, number];
  castShadow: boolean;
  /** Nectar source visited by butterflies and bees. */
  flower?: boolean;
  /** Has a cheaper far-distance model. */
  hasLow?: boolean;
}

export const PLANT_META: Record<string, PlantMeta> = {
  'dipterocarpus-alatus': { kind: 'tree', height: 30, radius: 3.2, centerY: 6, trunkRadius: 0.75, scale: [0.8, 1.25], castShadow: true, hasLow: true },
  'caryota-mitis': { kind: 'tree', height: 8, radius: 2.4, centerY: 4.5, trunkRadius: 0.35, scale: [0.8, 1.3], castShadow: true, hasLow: true },
  'bambusa-vulgaris': { kind: 'tree', height: 12, radius: 2.4, centerY: 4, trunkRadius: 0.9, scale: [0.8, 1.2], castShadow: true, hasLow: true },
  'ficus-religiosa': { kind: 'tree', height: 17, radius: 3.6, centerY: 5, trunkRadius: 1.5, scale: [0.9, 1.25], castShadow: true, hasLow: true },
  'pinus-kesiya': { kind: 'tree', height: 18, radius: 2.6, centerY: 6, trunkRadius: 0.42, scale: [0.75, 1.3], castShadow: true, hasLow: true },
  'bombax-ceiba': { kind: 'tree', height: 18, radius: 3, centerY: 6, trunkRadius: 0.6, scale: [0.85, 1.2], castShadow: true, flower: true, hasLow: true },
  'dicranopteris-linearis': { kind: 'understory', height: 0.9, radius: 1.0, centerY: 0.45, trunkRadius: 0, scale: [0.8, 1.5], castShadow: false },
  'asplenium-nidus': { kind: 'understory', height: 0.85, radius: 0.85, centerY: 0.45, trunkRadius: 0, scale: [0.8, 1.4], castShadow: false },
  'alocasia-macrorrhizos': { kind: 'understory', height: 2.1, radius: 1.3, centerY: 1.1, trunkRadius: 0, scale: [0.75, 1.3], castShadow: true },
  'colocasia-esculenta': { kind: 'understory', height: 1.1, radius: 0.8, centerY: 0.6, trunkRadius: 0, scale: [0.8, 1.3], castShadow: false },
  'nelumbo-nucifera': { kind: 'aquatic', height: 1.0, radius: 1.3, centerY: 0.4, trunkRadius: 0, scale: [0.85, 1.3], castShadow: false, flower: true },
  'melastoma-malabathricum': { kind: 'understory', height: 1.4, radius: 0.95, centerY: 0.75, trunkRadius: 0, scale: [0.8, 1.3], castShadow: true, flower: true },
  'rhododendron-simsii': { kind: 'understory', height: 1.5, radius: 1.0, centerY: 0.8, trunkRadius: 0, scale: [0.8, 1.4], castShadow: true, flower: true },
  'imperata-cylindrica': { kind: 'understory', height: 1.3, radius: 0.7, centerY: 0.6, trunkRadius: 0, scale: [0.8, 1.4], castShadow: false },
  rock: { kind: 'rock', height: 1.2, radius: 1, centerY: 0.4, trunkRadius: 0.8, scale: [0.35, 2.3], castShadow: true },
};

const TAU = Math.PI * 2;

interface CrownOptions {
  pos: [number, number, number];
  r: number;
  scale?: [number, number, number];
  seed: number;
  color: ColorRepresentation | ColorFn;
  /** Colour of the dark inner mass that stops daylight showing straight through. */
  core: ColorRepresentation;
  cell?: AtlasCell;
  cards: number;
  card: number;
  wind: number | ((p: Vector3) => number);
}

/**
 * Set while a model is being built for the Low graphics preset: canopies become
 * solid shaded masses with no alpha-tested cards, which is far cheaper to fill.
 */
let simple = false;

/** A leafy mass: a dark low-poly core wrapped in textured leaf cards. */
function crown(b: GeoBuilder, o: CrownOptions): void {
  if (simple) {
    b.add(blob(o.r, o.cards > 30 ? 1 : 0, o.seed, 0.3), { pos: o.pos, scale: o.scale, color: o.color, wind: o.wind });
    return;
  }
  b.add(blob(o.r * 0.5, 0, o.seed, 0.25), { pos: o.pos, scale: o.scale, color: o.core, wind: o.wind });
  b.add(foliage(o.r, o.cards, o.seed, o.card), { pos: o.pos, scale: o.scale, color: o.color, cell: o.cell ?? 'broadleaf', soft: true, wind: o.wind });
}

function dipterocarp(hi: boolean): BufferGeometry {
  const r = mulberry32(11);
  const b = new GeoBuilder();
  const bark = gradient('#5a4c3d', '#8d7d69', 0, 22, 0.05);
  b.add(limb(0.72, 0.46, 21, hi ? 10 : 5, hi ? 3 : 1), { color: bark, cell: hi ? 'bark' : undefined });
  if (hi) {
    for (let i = 0; i < 5; i++) {
      // Plank buttresses at the base.
      b.add(cone(0.55, 3.4, 4), { pos: [0, 0, 0], rot: [0.32, (i / 5) * TAU + 0.2, 0], scale: [0.32, 1, 1.3], color: bark });
    }
    for (let i = 0; i < 6; i++) {
      // Big ascending limbs carrying the emergent crown.
      const a = (i / 6) * TAU + 0.4;
      b.add(limb(0.24, 0.08, 7.5, 5), { pos: [0, 18 + i * 0.5, 0], rot: [0.85 + r() * 0.3, a, 0], color: bark, wind: 0.05 });
    }
  }
  const leaves = gradient('#2f6a27', '#7fb245', 13, 31, 0.07);
  crown(b, { pos: [1.2, 14.5, -0.8], r: hi ? 2.8 : 3.2, scale: [1.3, 0.6, 1.3], seed: 19, color: leaves, core: '#1c3d1a', cards: hi ? 26 : 10, card: hi ? 2.2 : 3.4, wind: 0.12 });
  const n = hi ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.8;
    const rad = i === 0 ? 0 : 3.6 + r() * 2.4;
    const size = hi ? 4.3 + r() * 1.7 : 6.4;
    crown(b, {
      pos: [Math.cos(a) * rad, 23 + r() * 4 + (i === 0 ? 3 : 0), Math.sin(a) * rad],
      r: size,
      scale: [1.15, 0.72, 1.15],
      seed: 20 + i,
      color: leaves,
      core: '#1c3d1a',
      cards: hi ? 64 : 24,
      card: hi ? 2.9 : 5,
      wind: (p) => 0.1 + Math.max(0, p.y - 20) * 0.012,
    });
  }
  return b.build();
}

function fishtailPalm(hi: boolean): BufferGeometry {
  const r = mulberry32(23);
  const b = new GeoBuilder();
  const stems = hi ? 3 : 1;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * TAU;
    const h = 5.2 + r() * 2.4;
    const ox = stems > 1 ? Math.cos(a) * 0.5 : 0;
    const oz = stems > 1 ? Math.sin(a) * 0.5 : 0;
    const lean = stems > 1 ? 0.07 : 0;
    b.add(limb(0.14, 0.1, h, hi ? 7 : 5, 1), { pos: [ox, 0, oz], rot: [lean, -a + Math.PI / 2, 0], color: gradient('#6d6a55', '#8f9a6a', 0, h, 0.04), cell: hi ? 'bark' : undefined });
    const tx = ox + Math.sin(-a + Math.PI / 2) * Math.sin(lean) * h;
    const tz = oz + Math.cos(-a + Math.PI / 2) * Math.sin(lean) * h;
    const fronds = hi ? 9 : 5;
    for (let f = 0; f < fronds; f++) {
      const fa = (f / fronds) * TAU + s;
      const up = f % 3 === 0 ? -1.15 : -0.7;
      b.add(simple ? leaf(3.4, 1.5, 3, 0.42, 0.25) : frond(3.5 + r() * 0.6, 1.7, hi ? 5 : 2, 0.36, 0.12), {
        pos: [tx, h - 0.1, tz],
        rot: [up + r() * 0.3, fa, 0],
        color: gradient('#3c7a2c', '#86b44a', h - 1.5, h + 2.5, 0.06),
        cell: simple ? undefined : 'palm',
        soft: !simple,
        wind: (p) => 0.25 + Math.hypot(p.x - tx, p.z - tz) * 0.22,
      });
    }
  }
  return b.build();
}

function bamboo(hi: boolean): BufferGeometry {
  const r = mulberry32(37);
  const b = new GeoBuilder();
  const culms = hi ? 14 : 5;
  for (let i = 0; i < culms; i++) {
    const a = r() * TAU;
    const d = r() * 0.85;
    const h = 8.5 + r() * 3.5;
    const lean = 0.06 + r() * 0.18;
    b.add(limb(0.07, 0.03, h, 5, hi ? 3 : 1), {
      pos: [Math.cos(a) * d, 0, Math.sin(a) * d],
      rot: [lean, a + Math.PI / 2, 0],
      color: gradient('#7c8f2d', '#c2c456', 0, h, 0.05),
      wind: (p) => p.y * 0.05,
    });
    const along = (f: number): [number, number, number] => [
      Math.cos(a) * d + Math.sin(a + Math.PI / 2) * Math.sin(lean) * h * f,
      Math.cos(lean) * h * f,
      Math.sin(a) * d + Math.cos(a + Math.PI / 2) * Math.sin(lean) * h * f,
    ];
    const tufts = hi && !simple ? [0.55, 0.78, 0.96] : hi || i % 2 === 0 ? [0.85] : [];
    tufts.forEach((f, k) => {
      const tint = gradient('#5e9a31', '#b7d264', h * 0.4, h, 0.08);
      if (simple) b.add(blob(1.2, 0, 40 + i * 3 + k, 0.35), { pos: along(f), scale: [1, 1.4, 1], color: tint, wind: 0.35 + f * 0.3 });
      else b.add(foliage(hi ? 1.25 : 1.9, hi ? 9 : 7, 40 + i * 3 + k, hi ? 1.7 : 2.6), { pos: along(f), scale: [1, 1.3, 1], color: tint, cell: 'spray', soft: true, wind: 0.35 + f * 0.3 });
    });
  }
  return b.build();
}

function sacredFig(hi: boolean): BufferGeometry {
  const r = mulberry32(51);
  const b = new GeoBuilder();
  const bark = gradient('#75695a', '#a2978a', 0, 9, 0.05);
  b.add(limb(1.35, 0.85, 7.5, hi ? 11 : 6, hi ? 2 : 1), { color: bark, cell: hi ? 'bark' : undefined });
  if (hi) {
    // Aerial roots and fused secondary stems typical of strangler figs.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r();
      const d = 1.2 + r() * 1.5;
      b.add(limb(0.2 + r() * 0.12, 0.09, 7 + r() * 2, 5), {
        pos: [Math.cos(a) * d, 0, Math.sin(a) * d],
        rot: [-0.14, a + Math.PI / 2, 0],
        color: bark,
        cell: 'bark',
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.add(limb(0.42, 0.14, 7.8, 6), { pos: [0, 6.2, 0], rot: [1.0 + r() * 0.2, a, 0], color: bark, wind: 0.04 });
    }
  }
  const leaves = gradient('#3f7a26', '#9cc24d', 7, 18, 0.08);
  const n = hi ? 10 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r();
    const rad = i === 0 ? 0 : 4 + r() * 3.2;
    crown(b, {
      pos: [Math.cos(a) * rad, 10.5 + r() * 3 + (i === 0 ? 3 : 0), Math.sin(a) * rad],
      r: hi ? 3.3 + r() * 1.3 : 5,
      scale: [1.2, 0.7, 1.2],
      seed: 60 + i,
      color: leaves,
      core: '#213f18',
      cards: hi ? 46 : 20,
      card: hi ? 2.1 : 3.8,
      wind: 0.22,
    });
  }
  return b.build();
}

function pine(hi: boolean): BufferGeometry {
  const r = mulberry32(67);
  const b = new GeoBuilder();
  const bark = gradient('#5a3b2a', '#96643f', 0, 17, 0.06);
  b.add(limb(0.42, 0.14, 17.5, hi ? 8 : 5, hi ? 2 : 1), { color: bark, cell: hi ? 'bark' : undefined });
  const needles = gradient('#28523a', '#6b9a58', 7, 19, 0.06);
  const tiers = hi ? 7 : 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 7.5 + t * 10;
    const size = 3.4 - t * 2.3;
    if (hi) {
      // Whorled branches, as in real pines.
      for (let k = 0; k < 4; k++) {
        b.add(limb(0.07, 0.025, size * 1.05, 4), { pos: [0, y - 0.3, 0], rot: [1.25 + r() * 0.2, (k / 4) * TAU + i, 0], color: bark, wind: 0.08 });
      }
    }
    const a = r() * TAU;
    crown(b, {
      pos: [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5],
      r: size,
      scale: [1, 0.42, 1],
      seed: 70 + i,
      color: needles,
      core: '#1a3324',
      cell: 'needle',
      cards: hi ? 34 : 14,
      card: hi ? 1.9 : 3,
      wind: 0.12 + t * 0.2,
    });
  }
  return b.build();
}

function silkCotton(hi: boolean): BufferGeometry {
  const r = mulberry32(83);
  const b = new GeoBuilder();
  const bark = gradient('#8b8780', '#b8b3a8', 0, 16, 0.04);
  b.add(limb(0.62, 0.3, 16.5, hi ? 9 : 5, hi ? 2 : 1), { color: bark, cell: hi ? 'bark' : undefined });
  const tiers = hi ? 4 : 2;
  for (let t = 0; t < tiers; t++) {
    const y = 7 + t * (hi ? 2.8 : 5.5);
    const len = 5.6 - t * 0.8;
    for (let i = 0; i < 5; i++) {
      // Bombax carries its branches in near-horizontal whorls.
      const a = (i / 5) * TAU + t * 0.6;
      b.add(limb(0.14, 0.05, len, 5), { pos: [0, y, 0], rot: [1.42, a, 0], color: bark, wind: 0.05 });
      const ex = Math.sin(a) * len * 0.92;
      const ez = Math.cos(a) * len * 0.92;
      crown(b, {
        pos: [ex, y + 0.9, ez],
        r: 1.35 + r() * 0.5,
        scale: [1.1, 0.62, 1.1],
        seed: 90 + i + t * 7,
        color: gradient('#3e7a2c', '#8ab84b', y, y + 2, 0.07),
        core: '#2f5a24',
        cards: hi ? 26 : 9,
        card: hi ? 1.5 : 2.2,
        wind: 0.3,
      });
      if (hi) {
        for (let k = 0; k < 3; k++) {
          const f = 0.35 + k * 0.22;
          b.add(sphere(0.2, 6, 5), { pos: [ex * f, y + 0.3 + f * 0.4, ez * f], scale: [1, 0.7, 1], color: '#d4302c', wind: 0.1 });
        }
      }
    }
  }
  return b.build();
}

function forkedFern(): BufferGeometry {
  const r = mulberry32(101);
  const b = new GeoBuilder();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + r() * 0.4;
    b.add(simple ? leaf(1.0 + r() * 0.35, 0.5, 3, 0.45, 0.15) : frond(1.0 + r() * 0.4, 0.5, 3, 0.4, 0.06), {
      pos: [0, 0.05, 0],
      rot: [-0.6 - r() * 0.55, a, 0],
      color: gradient('#4a8a2a', '#a9d24f', 0, 0.9, 0.08),
      cell: simple ? undefined : 'frond',
      soft: !simple,
      wind: (p) => p.y * 0.5,
    });
  }
  return b.build();
}

function birdsNestFern(): BufferGeometry {
  const r = mulberry32(113);
  const b = new GeoBuilder();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + r() * 0.3;
    // Undivided strap fronds with a pale midrib form the "nest" rosette.
    b.add(leaf(0.85 + r() * 0.2, 0.26, 3, 0.18, 0.5), {
      pos: [0, 0.08, 0],
      rot: [-0.95 - r() * 0.35, a, 0],
      color: gradient('#3f7a26', '#7fbf45', 0, 0.8, 0.06),
      cell: 'vein',
      wind: (p) => p.y * 0.3,
    });
  }
  b.add(sphere(0.16, 6, 4), { pos: [0, 0.1, 0], scale: [1, 0.6, 1], color: '#4a3a22' });
  return b.build();
}

function elephantEar(petiole: number, blade: number, bladeWidth: number, tint: [string, string], droop: number, seed: number): BufferGeometry {
  const r = mulberry32(seed);
  const b = new GeoBuilder();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    const lean = 0.22 + r() * 0.3;
    const h = petiole * (0.8 + r() * 0.4);
    b.add(limb(0.035 * blade + 0.02, 0.02, h, 5), { rot: [lean, a, 0], color: '#5f8a45', wind: (p) => p.y * 0.2 });
    const tx = Math.sin(a) * Math.sin(lean) * h;
    const tz = Math.cos(a) * Math.sin(lean) * h;
    const ty = Math.cos(lean) * h;
    b.add(leaf(blade, bladeWidth, 5, 0.3, 0.2), {
      pos: [tx - Math.sin(a) * blade * 0.25, ty, tz - Math.cos(a) * blade * 0.25],
      rot: [droop, a, 0],
      color: gradient(tint[0], tint[1], ty - 0.4, ty + 0.5, 0.05),
      cell: 'vein',
      wind: 0.45,
    });
  }
  return b.build();
}

function lotus(): BufferGeometry {
  const r = mulberry32(131);
  const b = new GeoBuilder();
  const pad = (x: number, z: number, y: number, rad: number): void => {
    const g = new CylinderGeometry(rad, rad * 0.94, 0.03, 14, 1);
    b.add(g, { pos: [x, y, z], rot: [y > 0.1 ? 0.12 : 0, r() * TAU, 0], color: gradient('#3f7f4a', '#74b262', y - 0.05, y + 0.05, 0.05), wind: y > 0.1 ? 0.35 : 0 });
    b.add(limb(0.02, 0.018, 1.7, 4), { pos: [x, y - 1.7, z], color: '#557a4a' });
  };
  pad(0.7, 0.2, 0.03, 0.42);
  pad(-0.55, 0.6, 0.03, 0.36);
  pad(-0.3, -0.75, 0.03, 0.4);
  pad(0.35, -0.5, 0.55, 0.36);
  pad(-0.75, -0.1, 0.75, 0.32);
  // Flower held above the water on its own stalk.
  b.add(limb(0.022, 0.018, 2.5, 4), { pos: [0.05, -1.6, 0.1], color: '#557a4a' });
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + ring * 0.4;
      b.add(leaf(0.2, 0.11, 3, -0.3, 0.3), {
        pos: [0.05, 0.9, 0.1],
        rot: [-0.55 - ring * 0.5, a, 0],
        color: gradient('#f3a9c3', '#f7dbe6', 0.9, 1.08, 0.03),
        wind: 0.3,
      });
    }
  }
  b.add(sphere(0.055, 6, 5), { pos: [0.05, 0.94, 0.1], scale: [1, 0.8, 1], color: '#e8c43e', wind: 0.3 });
  // Closed bud.
  b.add(limb(0.018, 0.016, 2.2, 4), { pos: [-0.25, -1.6, 0.3], color: '#557a4a' });
  b.add(sphere(0.07, 6, 5), { pos: [-0.25, 0.66, 0.3], scale: [1, 1.7, 1], color: '#e98fb2', wind: 0.3 });
  return b.build();
}

function floweringShrub(leafA: string, leafB: string, flower: string, flowers: number, seed: number): BufferGeometry {
  const r = mulberry32(seed);
  const b = new GeoBuilder();
  b.add(limb(0.06, 0.03, 0.6, 5), { color: '#5b4632' });
  for (let i = 0; i < 4; i++) b.add(limb(0.025, 0.012, 0.7, 4), { pos: [0, 0.3, 0], rot: [0.7, (i / 4) * TAU + 0.5, 0], color: '#5b4632' });
  const lumps: [number, number, number, number][] = [
    [0, 0.85, 0, 0.62],
    [0.42, 0.62, 0.1, 0.46],
    [-0.35, 0.66, -0.25, 0.5],
    [0.05, 0.6, 0.45, 0.42],
  ];
  lumps.forEach(([x, y, z, s], i) => {
    crown(b, { pos: [x, y, z], r: s, seed: seed + i, color: gradient(leafA, leafB, 0.3, 1.4, 0.07), core: leafA, cell: 'smallleaf', cards: 18, card: s * 1.15, wind: (p) => p.y * 0.25 });
  });
  for (let i = 0; i < flowers; i++) {
    const l = lumps[i % lumps.length]!;
    const a = r() * TAU;
    const e = 0.2 + r() * 1.1;
    const s = l[3] * 1.08;
    const px = l[0] + Math.cos(a) * Math.sin(e) * s;
    const py = l[1] + Math.cos(e) * s;
    const pz = l[2] + Math.sin(a) * Math.sin(e) * s;
    for (let k = 0; k < 5; k++) {
      b.add(leaf(0.1, 0.08, 2, 0, 0), { pos: [px, py, pz], rot: [-0.25, (k / 5) * TAU, 0], color: flower, wind: py * 0.25 });
    }
    b.add(sphere(0.02, 5, 4), { pos: [px, py + 0.012, pz], color: '#f1d04a', wind: py * 0.25 });
  }
  return b.build();
}

function cogonGrass(): BufferGeometry {
  const r = mulberry32(151);
  const b = new GeoBuilder();
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU;
    const d = r() * 0.28;
    b.add(leaf(0.9 + r() * 0.45, 0.06, 2, 0.22, 0), {
      pos: [Math.cos(a) * d, 0, Math.sin(a) * d],
      rot: [-1.15 - r() * 0.35, a, 0],
      color: gradient('#6f8f2e', '#c4c765', 0, 1.2, 0.07),
      wind: (p) => p.y * 0.75,
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = r() * TAU;
    const lean = 0.08 + r() * 0.14;
    const h = 1.05 + r() * 0.3;
    b.add(limb(0.008, 0.006, h, 3), { rot: [lean, a, 0], color: '#b9b56a', wind: (p) => p.y * 0.8 });
    // Silvery-white plume (the seed head that gives cogon its look).
    b.add(sphere(0.045, 5, 5), {
      pos: [Math.sin(a) * Math.sin(lean) * h, Math.cos(lean) * h + 0.07, Math.cos(a) * Math.sin(lean) * h],
      scale: [1, 3.4, 1],
      color: '#f3f1e4',
      wind: 1,
    });
  }
  return b.build();
}

function rock(seed: number): BufferGeometry {
  const b = new GeoBuilder();
  const stone = new Color('#8a8780');
  const moss = new Color('#5f7d3c');
  const dark = new Color('#5b5852');
  const tone: ColorFn = (p, n) => {
    const c = stone.clone().lerp(dark, Math.max(0, -n.y) * 0.8);
    if (n.y > 0.5) c.lerp(moss, (n.y - 0.5) * 1.5);
    return c.offsetHSL(0, 0, Math.sin(p.x * 9 + p.z * 7) * 0.02);
  };
  // Two or three fused masses read as weathered rock rather than a ball.
  if (simple) {
    b.add(blob(1, 1, seed, 0.3), { pos: [0, 0.35, 0], scale: [1.15, 0.75, 0.95], color: tone });
    return b.build();
  }
  b.add(blob(1, 2, seed, 0.34), { pos: [0, 0.32, 0], scale: [1.2, 0.72, 0.95], color: tone, cell: 'rock' });
  b.add(blob(0.62, 1, seed + 3, 0.36), { pos: [0.85, 0.16, 0.25], scale: [1.1, 0.7, 1], rot: [0, 0.8, 0], color: tone, cell: 'rock' });
  b.add(blob(0.5, 1, seed + 5, 0.36), { pos: [-0.7, 0.12, -0.5], scale: [1, 0.6, 1.2], rot: [0, 2.1, 0], color: tone, cell: 'rock' });
  return b.build();
}

/* ---------- ground cover (decorative, not catalogued species) ---------- */

function grassTuft(): BufferGeometry {
  const b = new GeoBuilder();
  if (simple) {
    // Untextured blades for the Low preset.
    const r = mulberry32(171);
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU;
      b.add(blade(0.4 + r() * 0.32, 0.075), { pos: [Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09], rot: [-1.15 - r() * 0.35, a, 0], color: gradient('#557d2a', '#a6c25a', 0, 0.55, 0.05), ground: true, wind: (p) => p.y * 1.4 });
    }
    return b.build();
  }
  b.add(crossCards(0.95, 0.5, simple ? 2 : 3, 0.14), { color: gradient('#55822a', '#b4cc66', 0, 0.5, 0), cell: 'grass', ground: true, wind: (p) => p.y * 1.5 });
  return b.build();
}

function reedClump(): BufferGeometry {
  const b = new GeoBuilder();
  if (simple) {
    const r = mulberry32(181);
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU;
      b.add(leaf(1.3 + r() * 0.6, 0.07, 2, 0.12, 0), { pos: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], rot: [-1.35 - r() * 0.15, a, 0], color: gradient('#587a36', '#c2c97c', 0, 1.8, 0.04), ground: true, wind: (p) => p.y * 0.55 });
    }
    return b.build();
  }
  b.add(crossCards(1.2, 1.9, 3, 0.2), { color: gradient('#587a36', '#c2c97c', 0, 1.9, 0), cell: 'reed', ground: true, wind: (p) => p.y * 0.55 });
  return b.build();
}

function waterWeed(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(crossCards(0.9, 0.85, 3, 0.2), { color: gradient('#2f5f33', '#7fae62', 0, 0.85, 0), cell: 'weed', ground: true, wind: (p) => p.y * 1.1 });
  return b.build();
}

function wildflowers(): BufferGeometry {
  const b = new GeoBuilder();
  // White in the texture: the instance tint decides the flower colour.
  b.add(crossCards(0.8, 0.6, 2, 0.1), { color: '#ffffff', cell: 'wildflower', ground: true, wind: (p) => p.y * 1.2 });
  return b.build();
}

const cache = new Map<string, BufferGeometry>();

/**
 * Builds (and caches) the geometry for a plant model. `low` requests the far LOD;
 * `simpleFoliage` requests solid canopies (Low graphics preset).
 */
export function getPlantGeometry(id: string, low = false, simpleFoliage = false): BufferGeometry {
  const key = `${id}:${low ? 0 : 1}:${simpleFoliage ? 's' : 'c'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const hi = !low;
  simple = simpleFoliage;
  let g: BufferGeometry;
  switch (id) {
    case 'dipterocarpus-alatus': g = dipterocarp(hi); break;
    case 'caryota-mitis': g = fishtailPalm(hi); break;
    case 'bambusa-vulgaris': g = bamboo(hi); break;
    case 'ficus-religiosa': g = sacredFig(hi); break;
    case 'pinus-kesiya': g = pine(hi); break;
    case 'bombax-ceiba': g = silkCotton(hi); break;
    case 'dicranopteris-linearis': g = forkedFern(); break;
    case 'asplenium-nidus': g = birdsNestFern(); break;
    case 'alocasia-macrorrhizos': g = elephantEar(1.5, 1.15, 0.85, ['#1f5a2a', '#4f9340'], 0.35, 121); break;
    case 'colocasia-esculenta': g = elephantEar(0.8, 0.6, 0.46, ['#3a7a3f', '#79b560'], 0.75, 127); break;
    case 'nelumbo-nucifera': g = lotus(); break;
    case 'melastoma-malabathricum': g = floweringShrub('#2c5a26', '#5f9440', '#b24fc4', 9, 141); break;
    case 'rhododendron-simsii': g = floweringShrub('#2a5230', '#4f8346', '#e23d5c', 16, 147); break;
    case 'imperata-cylindrica': g = cogonGrass(); break;
    case 'rock': g = rock(161); break;
    case 'grass': g = grassTuft(); break;
    case 'reed': g = reedClump(); break;
    case 'waterweed': g = waterWeed(); break;
    case 'wildflower': g = wildflowers(); break;
    default: throw new Error(`No plant model for "${id}"`);
  }
  cache.set(key, g);
  return g;
}

export function disposePlantGeometries(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
