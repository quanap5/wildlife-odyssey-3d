/**
 * Deterministic, chunk-based vegetation placement. The same seed always yields
 * the same plants with the same ids, so discoveries and photos stay valid
 * across sessions without saving any plant positions.
 */
import { WORLD } from '../../config';
import { BIOMES, type PlantRule } from '../../data/biomes/biomes';
import { hash2, mulberry32, pickWeighted } from '../../utils/rng';
import { chunkKey, chunkOrigin } from '../streaming/chunks';
import { getWorld, type WorldData } from '../terrain/heightmap';
import { FEATURE_PLANTS, FLATTEN_SPOTS, RUINS } from '../terrain/layout';
import { chunkCoord } from '../streaming/chunks';
import { PLANT_META, type PlantKind } from './plantModels';

export interface PlantInstance {
  /** Stable id: `${speciesId}@${chunkKey}.${index}`. */
  id: string;
  /** Species id, or 'rock' for boulders. */
  speciesId: string;
  kind: PlantKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** 0..1; instances with rank above the vegetation-density setting are hidden. */
  rank: number;
  /** Per-instance tint multiplier. */
  tint: number;
}

export interface ChunkContent {
  key: number;
  cx: number;
  cz: number;
  trees: PlantInstance[];
  plants: PlantInstance[];
  rocks: PlantInstance[];
}

const TREE_CELL = 8;
const PLANT_CELL = 4;
const ROCK_CELL = 16;

function blockedByStructure(x: number, z: number, margin: number): boolean {
  for (const s of FLATTEN_SPOTS) {
    if (Math.hypot(x - s.x, z - s.z) < s.r + margin) return true;
  }
  return false;
}

function ruleAllows(rule: PlantRule, h: number, slope: number): boolean {
  if (h < (rule.minH ?? 0.6)) return false;
  if (rule.maxH !== undefined && h > rule.maxH) return false;
  if (slope > (rule.maxSlope ?? 0.45)) return false;
  return true;
}

function scatter(
  world: WorldData,
  cx: number,
  cz: number,
  cell: number,
  salt: number,
  out: PlantInstance[],
  choose: (x: number, z: number, h: number, slope: number, rnd: () => number) => string | null,
): void {
  const ox = chunkOrigin(cx);
  const oz = chunkOrigin(cz);
  const key = chunkKey(cx, cz);
  const n = WORLD.chunkSize / cell;
  const rnd = mulberry32((WORLD.seed ^ Math.imul(key + 1, 2654435761) ^ Math.imul(salt, 40503)) >>> 0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Always draw the same number of randoms per cell so layouts are stable.
      const jx = rnd();
      const jz = rnd();
      const rRot = rnd();
      const rScale = rnd();
      const rRank = rnd();
      const x = ox + (i + 0.15 + jx * 0.7) * cell;
      const z = oz + (j + 0.15 + jz * 0.7) * cell;
      const h = world.heightAt(x, z);
      const slope = world.slopeAt(x, z);
      const speciesId = choose(x, z, h, slope, rnd);
      if (!speciesId) continue;
      const meta = PLANT_META[speciesId];
      if (!meta) continue;
      const scale = meta.scale[0] + (meta.scale[1] - meta.scale[0]) * rScale;
      out.push({
        id: `${speciesId}@${key}.${out.length}`,
        speciesId,
        kind: meta.kind,
        x,
        y: meta.kind === 'aquatic' ? WORLD.waterLevel : h - (meta.kind === 'tree' ? 0.15 : 0.03),
        z,
        rot: rRot * Math.PI * 2,
        scale,
        rank: rRank,
        tint: 0.86 + hash2(i + cx * 31, j + cz * 17, salt) * 0.28,
      });
    }
  }
}

function buildChunk(cx: number, cz: number): ChunkContent {
  const world = getWorld();
  const content: ChunkContent = { key: chunkKey(cx, cz), cx, cz, trees: [], plants: [], rocks: [] };

  scatter(world, cx, cz, TREE_CELL, 1, content.trees, (x, z, h, slope, rnd) => {
    const roll = rnd();
    const pick = rnd();
    const biome = BIOMES[world.biomeAt(x, z)];
    if (blockedByStructure(x, z, 3)) return null;
    for (const f of FEATURE_PLANTS) if (Math.hypot(x - f.x, z - f.z) < 9) return null;
    // The ruins courtyard itself stays open; trees crowd its edge.
    if (Math.hypot(x - RUINS.x, z - RUINS.z) < 30) return null;
    let density = biome.treeDensity;
    if (biome.id === 'mountain') density *= Math.max(0, 1 - Math.max(0, h - 28) / 55);
    if (roll > density) return null;
    const rule = pickWeighted(biome.trees, pick);
    if (!rule || !ruleAllows(rule, h, slope)) return null;
    return rule.speciesId;
  });

  scatter(world, cx, cz, PLANT_CELL, 2, content.plants, (x, z, h, slope, rnd) => {
    const roll = rnd();
    const pick = rnd();
    const biome = BIOMES[world.biomeAt(x, z)];
    if (blockedByStructure(x, z, 1)) return null;
    // Aquatic and bank plants get denser cover where their height band applies.
    const candidates = biome.understory.filter((r) => ruleAllows(r, h, slope));
    if (candidates.length === 0) return null;
    const density = h < 0.8 ? biome.understoryDensity * 0.55 : biome.understoryDensity;
    if (roll > density) return null;
    return pickWeighted(candidates, pick)?.speciesId ?? null;
  });

  scatter(world, cx, cz, ROCK_CELL, 3, content.rocks, (x, z, h, slope, rnd) => {
    let roll = rnd();
    // Scree gathers on slopes and boulders line the water's edge.
    if (slope > 0.28) roll *= 0.45;
    if (h > -0.3 && h < 0.9) roll *= 0.55;
    const biome = BIOMES[world.biomeAt(x, z)];
    if (blockedByStructure(x, z, 2)) return null;
    if (h < -1.2) return roll < 0.25 ? 'rock' : null; // rocks beneath the surface
    if (roll > biome.rockDensity) return null;
    return 'rock';
  });
  for (const r of content.rocks) r.y -= 0.12 * r.scale;

  FEATURE_PLANTS.forEach((f, i) => {
    if (chunkCoord(f.x) !== cx || chunkCoord(f.z) !== cz) return;
    content.trees.push({
      id: `${f.speciesId}@feature.${i}`,
      speciesId: f.speciesId,
      kind: 'tree',
      x: f.x,
      y: world.heightAt(f.x, f.z) - 0.15,
      z: f.z,
      rot: f.rot,
      scale: f.scale,
      rank: 0,
      tint: 1,
    });
  });

  return content;
}

const cache = new Map<number, ChunkContent>();

export function getChunkContent(cx: number, cz: number): ChunkContent {
  const key = chunkKey(cx, cz);
  let c = cache.get(key);
  if (!c) {
    c = buildChunk(cx, cz);
    cache.set(key, c);
  }
  return c;
}

export function getChunkContentByKey(key: number): ChunkContent {
  return getChunkContent(key % WORLD.chunksPerSide, Math.floor(key / WORLD.chunksPerSide));
}

/** Evicts cached chunk content far from the player to bound memory. */
export function trimChunkCache(keep: ReadonlySet<number>, max = 160): void {
  if (cache.size <= max) return;
  for (const k of cache.keys()) {
    if (!keep.has(k)) cache.delete(k);
    if (cache.size <= max) break;
  }
}
