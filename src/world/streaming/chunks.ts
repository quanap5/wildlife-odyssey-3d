/** Chunk grid helpers used for terrain LOD, vegetation streaming and physics. */
import { WORLD } from '../../config';
import { clamp } from '../../utils/math';

export interface ChunkRef {
  key: number;
  cx: number;
  cz: number;
  /** Chebyshev ring distance from the player's chunk. */
  ring: number;
}

export const chunkKey = (cx: number, cz: number): number => cz * WORLD.chunksPerSide + cx;

export const chunkCoord = (v: number): number =>
  clamp(Math.floor((v + WORLD.half) / WORLD.chunkSize), 0, WORLD.chunksPerSide - 1);

export const chunkOrigin = (c: number): number => -WORLD.half + c * WORLD.chunkSize;

export function chunkKeyAt(x: number, z: number): number {
  return chunkKey(chunkCoord(x), chunkCoord(z));
}

/** All chunks within `radius` rings of the position, nearest first. */
export function chunksAround(x: number, z: number, radius: number): ChunkRef[] {
  const pcx = chunkCoord(x);
  const pcz = chunkCoord(z);
  const out: ChunkRef[] = [];
  for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
    if (cz < 0 || cz >= WORLD.chunksPerSide) continue;
    for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
      if (cx < 0 || cx >= WORLD.chunksPerSide) continue;
      out.push({ key: chunkKey(cx, cz), cx, cz, ring: Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) });
    }
  }
  out.sort((a, b) => a.ring - b.ring);
  return out;
}

/** Terrain level of detail for a chunk ring: grid step in cells (1 = 2 m). */
export function terrainLodStep(ring: number): 1 | 2 | 4 {
  if (ring <= 1) return 1;
  if (ring <= 3) return 2;
  return 4;
}

/** Computes which chunks to load and unload when the active set changes. */
export function diffChunkSets(prev: ReadonlySet<number>, next: ReadonlySet<number>): { load: number[]; unload: number[] } {
  const load: number[] = [];
  const unload: number[] = [];
  for (const k of next) if (!prev.has(k)) load.push(k);
  for (const k of prev) if (!next.has(k)) unload.push(k);
  return { load, unload };
}
