/** World <-> map coordinate conversion and exploration-grid helpers (pure). */
import { WORLD } from '../../config';
import { clamp } from '../../utils/math';

/** Exploration grid: 32 x 32 cells of 32 m. */
export const EXPLORE_CELLS = 32;
export const EXPLORE_CELL_SIZE = WORLD.size / EXPLORE_CELLS;

export interface MapPoint {
  x: number;
  y: number;
}

/** World (x east, z south) -> map pixels (origin top-left, north up). */
export function worldToMap(x: number, z: number, mapSize: number): MapPoint {
  return { x: ((x + WORLD.half) / WORLD.size) * mapSize, y: ((z + WORLD.half) / WORLD.size) * mapSize };
}

export function mapToWorld(px: number, py: number, mapSize: number): { x: number; z: number } {
  return { x: (px / mapSize) * WORLD.size - WORLD.half, z: (py / mapSize) * WORLD.size - WORLD.half };
}

export function exploreCellIndex(x: number, z: number): number {
  const cx = clamp(Math.floor((x + WORLD.half) / EXPLORE_CELL_SIZE), 0, EXPLORE_CELLS - 1);
  const cz = clamp(Math.floor((z + WORLD.half) / EXPLORE_CELL_SIZE), 0, EXPLORE_CELLS - 1);
  return cz * EXPLORE_CELLS + cx;
}

/** Cells revealed when standing at a position (the cell and its neighbours). */
export function cellsAround(x: number, z: number, radiusCells = 1): number[] {
  const cx = clamp(Math.floor((x + WORLD.half) / EXPLORE_CELL_SIZE), 0, EXPLORE_CELLS - 1);
  const cz = clamp(Math.floor((z + WORLD.half) / EXPLORE_CELL_SIZE), 0, EXPLORE_CELLS - 1);
  const out: number[] = [];
  for (let j = cz - radiusCells; j <= cz + radiusCells; j++) {
    for (let i = cx - radiusCells; i <= cx + radiusCells; i++) {
      if (i < 0 || j < 0 || i >= EXPLORE_CELLS || j >= EXPLORE_CELLS) continue;
      out.push(j * EXPLORE_CELLS + i);
    }
  }
  return out;
}

/** Compass heading in degrees (0 = north, 90 = east) for a camera yaw. */
export function headingFromYaw(yaw: number): number {
  return ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
}

/** Bearing from one point to another, degrees clockwise from north. */
export function bearingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest difference between two headings, -180..180. */
export function headingDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}
