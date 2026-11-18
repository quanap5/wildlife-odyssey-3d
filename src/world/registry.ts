/**
 * Run-time registry of live world systems and the entities currently streamed
 * in. Systems publish here; gameplay code (targeting, interaction, audio)
 * reads from here instead of reaching into rendering components.
 */
import type { PhysicsWorld } from '../engine/physics/physics';
import type { WildlifeSystem } from '../entities/wildlife/WildlifeSystem';
import type { Blocker, TargetCandidate } from '../systems/identification/targeting';
import { STATIC_COLLIDERS } from './structures/structures';
import { getWorld } from './terrain/heightmap';

export const registry = {
  wildlife: null as WildlifeSystem | null,
  physics: null as PhysicsWorld | null,
  /** Plants near the player that can be targeted. */
  plants: [] as TargetCandidate[],
  /** Sight blockers from vegetation near the player. */
  plantBlockers: [] as Blocker[],
  /** Sight blockers from built structures (constant). */
  structureBlockers: [] as Blocker[],
  /** Incremented whenever the streamed vegetation set is rebuilt. */
  vegetationVersion: 0,
};

let structuresReady = false;

/** Axis-aligned bounds are a conservative stand-in for rotated boxes when blocking sight. */
export function getStructureBlockers(): Blocker[] {
  if (!structuresReady) {
    const world = getWorld();
    registry.structureBlockers = STATIC_COLLIDERS.map((c): Blocker => {
      const ground = world.heightAt(c.x, c.z) + c.base;
      if (c.kind === 'cyl') return { kind: 'cylinder', x: c.x, z: c.z, y0: ground, y1: ground + c.h, r: c.r };
      const cs = Math.abs(Math.cos(c.rotY));
      const sn = Math.abs(Math.sin(c.rotY));
      const ex = c.hx * cs + c.hz * sn;
      const ez = c.hx * sn + c.hz * cs;
      // Shrink slightly so thin rotated props do not over-block.
      return { kind: 'box', minX: c.x - ex * 0.85, maxX: c.x + ex * 0.85, minY: ground, maxY: ground + c.hy * 2, minZ: c.z - ez * 0.85, maxZ: c.z + ez * 0.85 };
    });
    structuresReady = true;
  }
  return registry.structureBlockers;
}
