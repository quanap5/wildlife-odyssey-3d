/**
 * Player collision. Primary backend: Rapier (heightfield terrain per chunk,
 * cylinders for trunks, balls for boulders, cuboids for structures) driven by
 * its kinematic character controller. If the WASM module cannot start, an
 * analytic solver over the same collider data takes over, so movement and
 * collision never depend on WebAssembly being available.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { PLAYER, WORLD } from '../../config';
import { clamp } from '../../utils/math';
import { chunkCoord, chunkKey, chunkOrigin } from '../../world/streaming/chunks';
import { STATIC_COLLIDERS, type StaticCollider } from '../../world/structures/structures';
import { getWorld, type WorldData } from '../../world/terrain/heightmap';
import { getChunkContent } from '../../world/vegetation/placement';
import { PLANT_META } from '../../world/vegetation/plantModels';

type Rapier = typeof RAPIER_NS;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsWorld {
  readonly backend: 'rapier' | 'analytic';
  /** Streams colliders for the 3x3 chunks around a position. */
  setCenter(x: number, z: number): void;
  /**
   * Moves the player's feet position by `delta`, resolving collisions.
   * Writes the new feet position into `out` and returns true when grounded.
   */
  move(feet: Vec3Like, delta: Vec3Like, dt: number, out: Vec3Like): boolean;
  teleport(feet: Vec3Like): void;
  dispose(): void;
}

/** Height samples for one chunk in Rapier's column-major layout (row = z, column = x). */
export function chunkHeightfield(world: WorldData, cx: number, cz: number): Float32Array {
  const n = WORLD.chunkCells;
  const gi = cx * n;
  const gj = cz * n;
  const out = new Float32Array((n + 1) * (n + 1));
  for (let col = 0; col <= n; col++) {
    for (let row = 0; row <= n; row++) {
      out[col * (n + 1) + row] = world.gridHeight(gi + col, gj + row);
    }
  }
  return out;
}

interface CircleCollider {
  x: number;
  z: number;
  r: number;
  top: number;
}

function chunkCircles(world: WorldData, cx: number, cz: number): CircleCollider[] {
  const content = getChunkContent(cx, cz);
  const out: CircleCollider[] = [];
  for (const t of content.trees) {
    const meta = PLANT_META[t.speciesId];
    if (meta && meta.trunkRadius > 0) out.push({ x: t.x, z: t.z, r: meta.trunkRadius * t.scale, top: t.y + 6 });
  }
  for (const r of content.rocks) {
    if (r.scale > 0.6) out.push({ x: r.x, z: r.z, r: 0.78 * r.scale, top: world.heightAt(r.x, r.z) + 0.75 * r.scale });
  }
  return out;
}

const HALF_H = (PLAYER.height - 2 * PLAYER.radius) / 2;
const CENTER = PLAYER.height / 2;

class RapierPhysics implements PhysicsWorld {
  readonly backend = 'rapier' as const;
  private readonly world: RAPIER_NS.World;
  private readonly body: RAPIER_NS.RigidBody;
  private readonly collider: RAPIER_NS.Collider;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  private readonly chunks = new Map<number, RAPIER_NS.Collider[]>();
  private centerKey = -1;

  constructor(
    private readonly R: Rapier,
    private readonly data: WorldData,
  ) {
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    this.body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 50, 0));
    this.collider = this.world.createCollider(R.ColliderDesc.capsule(HALF_H, PLAYER.radius), this.body);
    this.controller = this.world.createCharacterController(0.04);
    this.controller.enableAutostep(0.45, 0.2, false);
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((42 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    for (const c of STATIC_COLLIDERS) this.addStatic(c);
  }

  private addStatic(c: StaticCollider): void {
    const R = this.R;
    const ground = this.data.heightAt(c.x, c.z);
    if (c.kind === 'box') {
      const half = c.rotY / 2;
      this.world.createCollider(
        R.ColliderDesc.cuboid(c.hx, c.hy, c.hz)
          .setTranslation(c.x, ground + c.base + c.hy, c.z)
          .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
      );
    } else {
      this.world.createCollider(R.ColliderDesc.cylinder(c.h / 2, c.r).setTranslation(c.x, ground + c.base + c.h / 2, c.z));
    }
  }

  private loadChunk(cx: number, cz: number): RAPIER_NS.Collider[] {
    const R = this.R;
    const n = WORLD.chunkCells;
    const list: RAPIER_NS.Collider[] = [];
    const heights = chunkHeightfield(this.data, cx, cz);
    list.push(
      this.world.createCollider(
        R.ColliderDesc.heightfield(n, n, heights, { x: WORLD.chunkSize, y: 1, z: WORLD.chunkSize }).setTranslation(
          chunkOrigin(cx) + WORLD.chunkSize / 2,
          0,
          chunkOrigin(cz) + WORLD.chunkSize / 2,
        ),
      ),
    );
    const content = getChunkContent(cx, cz);
    for (const t of content.trees) {
      const meta = PLANT_META[t.speciesId];
      if (!meta || meta.trunkRadius <= 0) continue;
      list.push(this.world.createCollider(R.ColliderDesc.cylinder(3.5, meta.trunkRadius * t.scale).setTranslation(t.x, t.y + 3.5, t.z)));
    }
    for (const r of content.rocks) {
      if (r.scale <= 0.6) continue;
      list.push(this.world.createCollider(R.ColliderDesc.ball(0.78 * r.scale).setTranslation(r.x, r.y + 0.36 * r.scale, r.z)));
    }
    return list;
  }

  setCenter(x: number, z: number): void {
    const pcx = chunkCoord(x);
    const pcz = chunkCoord(z);
    const key = chunkKey(pcx, pcz);
    if (key === this.centerKey) return;
    this.centerKey = key;
    const want = new Set<number>();
    for (let cz = pcz - 1; cz <= pcz + 1; cz++) {
      for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
        if (cx < 0 || cz < 0 || cx >= WORLD.chunksPerSide || cz >= WORLD.chunksPerSide) continue;
        const k = chunkKey(cx, cz);
        want.add(k);
        if (!this.chunks.has(k)) this.chunks.set(k, this.loadChunk(cx, cz));
      }
    }
    for (const [k, list] of this.chunks) {
      if (want.has(k)) continue;
      for (const c of list) this.world.removeCollider(c, false);
      this.chunks.delete(k);
    }
    // Make the new colliders visible to queries immediately.
    this.world.step();
  }

  move(feet: Vec3Like, delta: Vec3Like, dt: number, out: Vec3Like): boolean {
    this.controller.computeColliderMovement(this.collider, delta);
    const m = this.controller.computedMovement();
    const grounded = this.controller.computedGrounded();
    out.x = feet.x + m.x;
    out.y = feet.y + m.y;
    out.z = feet.z + m.z;
    this.body.setNextKinematicTranslation({ x: out.x, y: out.y + CENTER, z: out.z });
    this.world.timestep = clamp(dt, 1 / 240, 1 / 20);
    this.world.step();
    return grounded;
  }

  teleport(feet: Vec3Like): void {
    this.centerKey = -1;
    this.setCenter(feet.x, feet.z);
    this.body.setTranslation({ x: feet.x, y: feet.y + CENTER, z: feet.z }, true);
    this.body.setNextKinematicTranslation({ x: feet.x, y: feet.y + CENTER, z: feet.z });
    this.world.step();
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.free();
  }
}

/** Dependency-free fallback: height sampling plus circle / box push-out. */
export class AnalyticPhysics implements PhysicsWorld {
  readonly backend = 'analytic' as const;
  private circles: CircleCollider[] = [];
  private centerKey = -1;

  constructor(private readonly data: WorldData) {}

  setCenter(x: number, z: number): void {
    const pcx = chunkCoord(x);
    const pcz = chunkCoord(z);
    const key = chunkKey(pcx, pcz);
    if (key === this.centerKey) return;
    this.centerKey = key;
    this.circles = [];
    for (let cz = pcz - 1; cz <= pcz + 1; cz++) {
      for (let cx = pcx - 1; cx <= pcx + 1; cx++) {
        if (cx < 0 || cz < 0 || cx >= WORLD.chunksPerSide || cz >= WORLD.chunksPerSide) continue;
        this.circles.push(...chunkCircles(this.data, cx, cz));
      }
    }
  }

  move(feet: Vec3Like, delta: Vec3Like, _dt: number, out: Vec3Like): boolean {
    let x = feet.x + delta.x;
    let z = feet.z + delta.z;
    const h0 = this.data.heightAt(feet.x, feet.z);
    // Refuse to climb slopes steeper than the walkable limit.
    const step = Math.hypot(delta.x, delta.z);
    if (step > 1e-5) {
      const rise = this.data.heightAt(x, z) - h0;
      if (rise / step > 1.35 && feet.y <= h0 + 0.3) {
        x = feet.x;
        z = feet.z;
      }
    }
    const pr = PLAYER.radius;
    for (const c of this.circles) {
      if (feet.y > c.top) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + pr;
      if (d < min && d > 1e-6) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    let floor = this.data.heightAt(x, z);
    for (const c of STATIC_COLLIDERS) {
      const ground = this.data.heightAt(c.x, c.z);
      const top = ground + c.base + (c.kind === 'box' ? c.hy * 2 : c.h);
      const bottom = ground + c.base;
      if (c.kind === 'cyl') {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + pr;
        if (d < min) {
          if (feet.y >= top - 0.45) floor = Math.max(floor, top);
          else if (feet.y + PLAYER.height > bottom && d > 1e-6) {
            x = c.x + (dx / d) * min;
            z = c.z + (dz / d) * min;
          }
        }
        continue;
      }
      // Box: work in the box's local frame.
      const cs = Math.cos(c.rotY);
      const sn = Math.sin(c.rotY);
      const lx = (x - c.x) * cs - (z - c.z) * sn;
      const lz = (x - c.x) * sn + (z - c.z) * cs;
      const ox = c.hx + pr - Math.abs(lx);
      const oz = c.hz + pr - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      if (feet.y >= top - 0.45) {
        // Low enough to step onto (platforms, stairs).
        if (Math.abs(lx) < c.hx && Math.abs(lz) < c.hz) floor = Math.max(floor, top);
        continue;
      }
      if (feet.y + PLAYER.height <= bottom) continue;
      let nlx = lx;
      let nlz = lz;
      if (ox < oz) nlx = Math.sign(lx || 1) * (c.hx + pr);
      else nlz = Math.sign(lz || 1) * (c.hz + pr);
      x = c.x + nlx * cs + nlz * sn;
      z = c.z - nlx * sn + nlz * cs;
    }
    let y = feet.y + delta.y;
    let grounded = false;
    if (y <= floor + 0.02 || (delta.y <= 0 && feet.y - floor < 0.45 && y - floor < 0.45)) {
      y = floor;
      grounded = true;
    }
    out.x = x;
    out.y = y;
    out.z = z;
    return grounded;
  }

  teleport(feet: Vec3Like): void {
    this.centerKey = -1;
    this.setCenter(feet.x, feet.z);
  }

  dispose(): void {
    this.circles = [];
  }
}

/** Creates the physics world, preferring Rapier and falling back gracefully. */
export async function createPhysics(): Promise<PhysicsWorld> {
  const data = getWorld();
  try {
    const mod = await import('@dimforge/rapier3d-compat');
    const R = (mod.default ?? mod) as Rapier;
    await R.init();
    return new RapierPhysics(R, data);
  } catch (err) {
    console.warn('[physics] Rapier unavailable, using analytic fallback:', err);
    return new AnalyticPhysics(data);
  }
}
