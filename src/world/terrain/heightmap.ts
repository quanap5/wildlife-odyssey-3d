/**
 * Deterministic terrain model. A single height grid (2 m cells) is generated once
 * from seeded noise + the hand-authored layout, and is shared by rendering,
 * physics, vegetation placement, wildlife and the map so they never disagree.
 */
import { WORLD } from '../../config';
import { BIOME_IDS, type BiomeId } from '../../data/biomes/biomes';
import { clamp, clamp01, lerp, pointSegmentDistance, smooth01 } from '../../utils/math';
import { fbm, noise2, ridged } from '../../utils/noise';
import { FLATTEN_SPOTS, LAKE, POOL, RIVER_PATH, RUINS } from './layout';

const SEED = WORLD.seed % 1000;

export function riverDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const a = RIVER_PATH[i]!;
    const b = RIVER_PATH[i + 1]!;
    const d = pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Normalised elliptical distance to the lake centre (1 = on the ellipse). */
export function lakeDistance(x: number, z: number): number {
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  return Math.sqrt(dx * dx + dz * dz);
}

export interface TerrainFields {
  /** Forest weight 0..1. */
  fw: number;
  /** Mountain mask 0..1. */
  mm: number;
  /** Distance to river centreline (m). */
  dr: number;
  /** Normalised lake distance. */
  dl: number;
  /** Distance to plunge pool centre (m). */
  dp: number;
  /** Distance to ruins centre (m). */
  druins: number;
}

export function terrainFields(x: number, z: number): TerrainFields {
  const n1 = fbm(x * 0.004 + 11, z * 0.004 + 7, 3, SEED + 1);
  const mm = smooth01((-175 - (z + n1 * 45)) / 155);
  const n2 = fbm(x * 0.006 + 31, z * 0.006 + 17, 3, SEED + 2);
  const fw = smooth01((-70 + n2 * 60 - x) / 60);
  return {
    fw,
    mm,
    dr: riverDistance(x, z),
    dl: lakeDistance(x, z),
    dp: Math.hypot(x - POOL.x, z - POOL.z),
    druins: Math.hypot(x - RUINS.x, z - RUINS.z),
  };
}

/** Land surface before levelling and water carving. */
function landHeight(x: number, z: number, f: TerrainFields): number {
  let h = 4.6 + 3.1 * fbm(x * 0.008, z * 0.008, 4, SEED) + 0.9 * fbm(x * 0.031, z * 0.031, 2, SEED + 5);
  h = Math.max(1.1, h);
  h += f.fw * (1.4 + 2.4 * fbm(x * 0.02 + 5, z * 0.02 + 9, 3, SEED + 3));
  // Mountain massif in the north.
  if (f.mm > 0) {
    const r = ridged(x * 0.0058, z * 0.0058, 4, SEED + 4);
    h += Math.pow(f.mm, 1.4) * (28 + 62 * r);
  }
  // Cliff behind the waterfall plunge pool.
  const cliff = smooth01((-204 - z) / 16) * Math.exp(-(((x - 70) / 55) ** 2)) * 24;
  h += cliff;
  // Valley rim hides the world edge.
  const e = Math.max(Math.abs(x), Math.abs(z));
  const rim = smooth01((e - 432) / 80);
  h += rim * rim * (48 + 14 * noise2(x * 0.02, z * 0.02, SEED + 6));
  return h;
}

/** Final terrain height in metres at any world position (slow path). */
export function computeHeight(x: number, z: number, fields?: TerrainFields): number {
  const f = fields ?? terrainFields(x, z);
  let h = landHeight(x, z, f);
  for (const s of FLATTEN_SPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r * 1.8) {
      const target = landHeight(s.x, s.z, terrainFields(s.x, s.z));
      const w = 1 - smooth01((d - s.r) / (s.r * 0.8));
      h = lerp(h, target, w);
    }
  }
  // Water carving: river channel, lake basin, plunge pool.
  h = lerp(-2.3, h, smooth01((f.dr - 4.5) / 15.5));
  h = lerp(-6.5, h, smooth01((f.dl - 0.55) / 0.57));
  h = lerp(-3.2, h, smooth01((f.dp - 9) / 15));
  return h;
}

export function biomeFromFields(f: TerrainFields): BiomeId {
  if (f.druins < RUINS.r) return 'ruins';
  if (f.dr < 26 || f.dl < 1.25 || f.dp < 30) return 'freshwater';
  if (f.mm > 0.22) return 'mountain';
  if (f.fw > 0.5) return 'rainforest';
  return 'grassland';
}

function terrainColor(x: number, z: number, h: number, ny: number, f: TerrainFields, out: [number, number, number]): void {
  const v = 0.5 + 0.5 * fbm(x * 0.05, z * 0.05, 2, SEED + 9);
  const v2 = 0.5 + 0.5 * noise2(x * 0.31, z * 0.31, SEED + 10);
  // Meadow green -> dry grass patches.
  let r = lerp(0.3, 0.46, v);
  let g = lerp(0.47, 0.5, v);
  let b = lerp(0.16, 0.2, v);
  // Forest floor: darker, leaf litter.
  const fr = lerp(0.17, 0.28, v2);
  const fg = lerp(0.29, 0.34, v);
  const fb = lerp(0.11, 0.15, v2);
  r = lerp(r, fr, f.fw);
  g = lerp(g, fg, f.fw);
  b = lerp(b, fb, f.fw);
  // Ruins: damp mossy ground.
  const ru = 1 - smooth01((f.druins - 30) / 45);
  r = lerp(r, 0.24, ru * 0.7);
  g = lerp(g, 0.32, ru * 0.7);
  b = lerp(b, 0.16, ru * 0.7);
  // Alpine turf with altitude.
  const alt = clamp01((h - 30) / 60) * f.mm;
  r = lerp(r, 0.42, alt * 0.7);
  g = lerp(g, 0.44, alt * 0.7);
  b = lerp(b, 0.26, alt * 0.7);
  // Rock on steep slopes.
  const rock = smooth01((0.86 - ny) / 0.2);
  const rk = lerp(0.36, 0.5, v2);
  r = lerp(r, rk, rock);
  g = lerp(g, rk * 0.97, rock);
  b = lerp(b, rk * 0.9, rock);
  // Sand / mud by the water, darker silt below it.
  const shore = 1 - smooth01((h - 0.25) / 1.1);
  r = lerp(r, 0.6, shore);
  g = lerp(g, 0.54, shore);
  b = lerp(b, 0.38, shore);
  const deep = smooth01(-h / 3.5);
  r = lerp(r, 0.2, deep);
  g = lerp(g, 0.24, deep);
  b = lerp(b, 0.2, deep);
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

export class WorldData {
  readonly heights: Float32Array;
  readonly biomes: Uint8Array;
  /** RGB per grid point, 0..255 (linear-ish albedo). */
  readonly colors: Uint8Array;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor() {
    const n = WORLD.grid;
    this.heights = new Float32Array(n * n);
    this.biomes = new Uint8Array(n * n);
    this.colors = new Uint8Array(n * n * 3);
    const fieldCache: TerrainFields[] = new Array<TerrainFields>(n * n);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < n; j++) {
      const z = -WORLD.half + j * WORLD.cell;
      for (let i = 0; i < n; i++) {
        const x = -WORLD.half + i * WORLD.cell;
        const f = terrainFields(x, z);
        const h = computeHeight(x, z, f);
        const k = j * n + i;
        this.heights[k] = h;
        this.biomes[k] = BIOME_IDS.indexOf(biomeFromFields(f));
        fieldCache[k] = f;
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    this.minHeight = lo;
    this.maxHeight = hi;
    const col: [number, number, number] = [0, 0, 0];
    const nrm: [number, number, number] = [0, 1, 0];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        this.gridNormal(i, j, nrm);
        terrainColor(-WORLD.half + i * WORLD.cell, -WORLD.half + j * WORLD.cell, this.heights[k]!, nrm[1], fieldCache[k]!, col);
        this.colors[k * 3] = Math.round(clamp01(col[0]) * 255);
        this.colors[k * 3 + 1] = Math.round(clamp01(col[1]) * 255);
        this.colors[k * 3 + 2] = Math.round(clamp01(col[2]) * 255);
      }
    }
  }

  gridHeight(i: number, j: number): number {
    const n = WORLD.grid;
    return this.heights[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)]!;
  }

  /** Surface normal at a grid point (central differences on the finest grid). */
  gridNormal(i: number, j: number, out: [number, number, number]): void {
    const dx = this.gridHeight(i - 1, j) - this.gridHeight(i + 1, j);
    const dz = this.gridHeight(i, j - 1) - this.gridHeight(i, j + 1);
    const dy = 2 * WORLD.cell;
    const len = Math.hypot(dx, dy, dz);
    out[0] = dx / len;
    out[1] = dy / len;
    out[2] = dz / len;
  }

  /** Bilinear height lookup, matches the rendered LOD0 mesh and the collider. */
  heightAt(x: number, z: number): number {
    const gx = clamp((x + WORLD.half) / WORLD.cell, 0, WORLD.grid - 1.0001);
    const gz = clamp((z + WORLD.half) / WORLD.cell, 0, WORLD.grid - 1.0001);
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const n = WORLD.grid;
    const k = j * n + i;
    const h00 = this.heights[k]!;
    const h10 = this.heights[k + 1]!;
    const h01 = this.heights[k + n]!;
    const h11 = this.heights[k + n + 1]!;
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  /** Steepness 0 (flat) .. 1 (vertical). */
  slopeAt(x: number, z: number): number {
    const e = WORLD.cell;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const ny = (2 * e) / Math.hypot(dx, 2 * e, dz);
    return 1 - ny;
  }

  biomeAt(x: number, z: number): BiomeId {
    const i = clamp(Math.round((x + WORLD.half) / WORLD.cell), 0, WORLD.grid - 1);
    const j = clamp(Math.round((z + WORLD.half) / WORLD.cell), 0, WORLD.grid - 1);
    return BIOME_IDS[this.biomes[j * WORLD.grid + i]!]!;
  }

  /** Water depth in metres (0 on dry land). */
  waterDepthAt(x: number, z: number): number {
    return Math.max(0, WORLD.waterLevel - this.heightAt(x, z));
  }

  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < WORLD.waterLevel - 0.05;
  }
}

let world: WorldData | null = null;

/** Lazy singleton: the world is generated once per page load. */
export function getWorld(): WorldData {
  if (!world) world = new WorldData();
  return world;
}
