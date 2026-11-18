import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER, WORLD } from '../config';
import { AnalyticPhysics, chunkHeightfield, createPhysics, type PhysicsWorld } from '../engine/physics/physics';
import { WildlifeSystem, type SimContext } from '../entities/wildlife/WildlifeSystem';
import { pickTarget, rankCandidates, segmentBlocked, targetVisibility, terrainBlocked, type Blocker, type TargetCandidate } from '../systems/identification/targeting';
import { chunkCoord } from '../world/streaming/chunks';
import { getWorld } from '../world/terrain/heightmap';
import { getChunkContent } from '../world/vegetation/placement';
import { PLANT_META } from '../world/vegetation/plantModels';

const world = getWorld();
const flat = (): number => 0;

describe('species identification by ray', () => {
  const deer: TargetCandidate = { id: 'deer', kind: 'animal', speciesId: 'rusa-unicolor', x: 0, y: 1, z: -20, radius: 0.9 };
  const fern: TargetCandidate = { id: 'fern', kind: 'plant', speciesId: 'dicranopteris-linearis', x: 0.3, y: 0.5, z: -8, radius: 1 };
  const origin = { x: 0, y: 1.6, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const opt = { maxDistance: 60, tolerance: 0.03 };

  it('picks what the reticle is on and ignores what is behind the camera', () => {
    expect(pickTarget(origin, forward, [deer], [], flat, opt)?.candidate.id).toBe('deer');
    expect(pickTarget(origin, { x: 0, y: 0, z: 1 }, [deer], [], flat, opt)).toBeNull();
    expect(pickTarget(origin, { x: 1, y: 0, z: 0 }, [deer], [], flat, opt)).toBeNull();
  });

  it('respects the tool range', () => {
    expect(pickTarget(origin, forward, [deer], [], flat, { maxDistance: 10, tolerance: 0.03 })).toBeNull();
  });

  it('prefers an animal over a plant that is also under the reticle', () => {
    const ranked = rankCandidates(origin, forward, [fern, deer], opt);
    expect(ranked[0]?.candidate.id).toBe('deer');
  });

  it('does not identify an animal hidden behind a tree trunk', () => {
    const trunk: Blocker = { kind: 'cylinder', x: 0, z: -10, y0: 0, y1: 20, r: 1.6 };
    expect(targetVisibility(origin, deer, [trunk], flat)).toBe(0);
    expect(pickTarget(origin, forward, [deer], [trunk], flat, opt)).toBeNull();
  });

  it('reports partial visibility behind a narrow trunk', () => {
    const thin: Blocker = { kind: 'cylinder', x: 0, z: -10, y0: 0, y1: 20, r: 0.12 };
    const v = targetVisibility(origin, deer, [thin], flat);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('does not identify through walls, boulders or hills', () => {
    const wall: Blocker = { kind: 'box', minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -11, maxZ: -10 };
    const boulder: Blocker = { kind: 'sphere', x: 0, y: 1.2, z: -6, r: 2 };
    expect(pickTarget(origin, forward, [deer], [wall], flat, opt)).toBeNull();
    expect(pickTarget(origin, forward, [deer], [boulder], flat, opt)).toBeNull();
    const hill = (_x: number, z: number): number => (z < -8 && z > -14 ? 5 : 0);
    expect(terrainBlocked(origin, deer, hill)).toBe(true);
    expect(pickTarget(origin, forward, [deer], [], hill, opt)).toBeNull();
  });

  it('never lets a plant block itself', () => {
    const tree: TargetCandidate = { id: 'tree-1', kind: 'plant', speciesId: 'bombax-ceiba', x: 0, y: 6, z: -20, radius: 3 };
    const own: Blocker = { kind: 'cylinder', x: 0, z: -20, y0: 0, y1: 12, r: 0.6, owner: 'tree-1' };
    expect(segmentBlocked(origin, tree, [own], 'tree-1')).toBe(false);
    expect(pickTarget(origin, { x: 0, y: 0.215, z: -0.977 }, [tree], [own], flat, opt)?.candidate.id).toBe('tree-1');
  });

  it('sees a real animal-sized target standing on the real terrain', () => {
    const x = -40;
    const z = 100;
    const cam = { x, y: world.heightAt(x, z) + 1.6, z };
    const t: TargetCandidate = { id: 't', kind: 'animal', speciesId: 'rusa-unicolor', x: x - 12, y: world.heightAt(x - 12, z) + 1, z, radius: 0.9 };
    expect(targetVisibility(cam, t, [], (a, b) => world.heightAt(a, b))).toBeGreaterThanOrEqual(0.6);
  });
});

describe('player physics', () => {
  let rapier: PhysicsWorld;
  beforeAll(async () => {
    rapier = await createPhysics();
  });

  const settle = (p: PhysicsWorld, start: Vector3, steps = 120): Vector3 => {
    const pos = start.clone();
    const out = new Vector3();
    let vy = 0;
    p.teleport(pos);
    for (let i = 0; i < steps; i++) {
      vy -= PLAYER.gravity / 60;
      const grounded = p.move(pos, { x: 0, y: vy / 60, z: 0 }, 1 / 60, out);
      pos.copy(out);
      if (grounded) vy = -1;
    }
    return pos;
  };

  const walk = (p: PhysicsWorld, start: Vector3, dx: number, dz: number, steps: number): Vector3 => {
    const pos = start.clone();
    const out = new Vector3();
    let vy = -1;
    for (let i = 0; i < steps; i++) {
      p.setCenter(pos.x, pos.z);
      vy -= PLAYER.gravity / 60;
      const grounded = p.move(pos, { x: dx / 60, y: vy / 60, z: dz / 60 }, 1 / 60, out);
      pos.copy(out);
      if (grounded) vy = -1;
    }
    return pos;
  };

  it('uses Rapier when WebAssembly is available', () => {
    expect(rapier.backend).toBe('rapier');
  });

  it('lays out heightfield samples column-major (row = z, column = x)', () => {
    const hf = chunkHeightfield(world, 9, 4);
    const n = WORLD.chunkCells;
    expect(hf.length).toBe((n + 1) * (n + 1));
    expect(hf[3 * (n + 1) + 7]).toBe(world.gridHeight(9 * n + 3, 4 * n + 7));
  });

  for (const name of ['rapier', 'analytic'] as const) {
    describe(name, () => {
      const get = (): PhysicsWorld => (name === 'rapier' ? rapier : new AnalyticPhysics(world));

      it('lands on the terrain and stays there (no falling through)', () => {
        for (const [x, z] of [[3, 66], [-200, 100], [-70, -292], [150, -40]] as const) {
          const end = settle(get(), new Vector3(x, world.heightAt(x, z) + 3, z));
          expect(Math.abs(end.y - world.heightAt(end.x, end.z)), `${x},${z}`).toBeLessThan(0.25);
        }
      });

      it('follows the ground while walking across the meadow', () => {
        const p = get();
        const start = settle(p, new Vector3(20, world.heightAt(20, 120) + 1, 120));
        const end = walk(p, start, 4.2, 0, 300);
        expect(end.x - start.x).toBeGreaterThan(15);
        expect(Math.abs(end.y - world.heightAt(end.x, end.z))).toBeLessThan(0.3);
      });

      it('cannot walk through a tree trunk', () => {
        const content = getChunkContent(chunkCoord(-230), chunkCoord(100));
        const tree = content.trees.find((t) => t.speciesId === 'dipterocarpus-alatus' && world.slopeAt(t.x, t.z) < 0.15)!;
        expect(tree).toBeDefined();
        const r = PLANT_META[tree.speciesId]!.trunkRadius * tree.scale;
        const p = get();
        const start = settle(p, new Vector3(tree.x - 3, world.heightAt(tree.x - 3, tree.z) + 0.5, tree.z));
        const end = walk(p, start, 3, 0, 180);
        // Either stopped by the trunk or slid around it; never inside it.
        expect(Math.hypot(end.x - tree.x, end.z - tree.z)).toBeGreaterThan(r + PLAYER.radius - 0.08);
      });

      it('cannot walk through the ruins wall', () => {
        const p = get();
        const start = settle(p, new Vector3(-320, world.heightAt(-320, 296) + 1, 296));
        const end = walk(p, start, 0, -3, 240);
        expect(end.z).toBeGreaterThan(293.4 - 0.4);
      });
    });
  }
});

describe('wildlife simulation', () => {
  const makeCtx = (player: Vector3): SimContext => ({ dt: 1 / 20, time: 0, player, playerSpeed: 0, playerCrouching: false, playerInWater: false, camera: player, hour: 8, raining: false, foggy: false, activeRadius: 150 });

  it('spawns every population in suitable habitat', () => {
    const sys = new WildlifeSystem();
    expect(sys.agents.length).toBeGreaterThan(100);
    for (const a of sys.agents) {
      const h = world.heightAt(a.position.x, a.position.z);
      if (a.profile.cls === 'fish') {
        expect(h, a.id).toBeLessThan(-0.6);
        expect(a.position.y, a.id).toBeLessThan(0);
        expect(a.position.y, a.id).toBeGreaterThan(h);
      } else if (a.profile.cls === 'walker') {
        expect(h, a.id).toBeGreaterThan(0);
      }
    }
    sys.dispose();
  });

  it('keeps fish inside the water volume over a long run', () => {
    const sys = new WildlifeSystem();
    const player = new Vector3(262, 0, 214);
    const ctx = makeCtx(player);
    ctx.playerInWater = true;
    ctx.playerSpeed = 4;
    for (let i = 0; i < 1200; i++) {
      ctx.time += ctx.dt;
      sys.update(ctx);
    }
    const fish = sys.agents.filter((a) => a.profile.cls === 'fish' && a.active);
    expect(fish.length).toBeGreaterThan(5);
    for (const f of fish) {
      const bed = world.heightAt(f.position.x, f.position.z);
      expect(bed, f.id).toBeLessThan(-0.4);
      expect(f.position.y, f.id).toBeLessThan(-0.1);
      expect(f.position.y, f.id).toBeGreaterThan(bed);
    }
    sys.dispose();
  });

  it('makes deer react to and flee from an approaching player', () => {
    const sys = new WildlifeSystem();
    const deer = sys.agents.find((a) => a.speciesId === 'rusa-unicolor')!;
    const player = deer.position.clone().add(new Vector3(60, 0, 0));
    const ctx = makeCtx(player);
    ctx.hour = 6.5;
    for (let i = 0; i < 40; i++) sys.update(ctx);
    expect(['alert', 'fleeing']).not.toContain(deer.currentBehavior);
    // Walk up to it.
    ctx.playerSpeed = 4;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      ctx.time += ctx.dt;
      const dir = deer.position.clone().sub(player).setY(0);
      if (dir.length() > 2) player.addScaledVector(dir.normalize(), 4 * ctx.dt);
      sys.update(ctx);
      seen.add(deer.currentBehavior);
    }
    expect(seen.has('alert')).toBe(true);
    expect(seen.has('fleeing')).toBe(true);
    sys.dispose();
  });

  it('gives different species different movement', () => {
    const sys = new WildlifeSystem();
    const player = new Vector3(20, 0, 110);
    const ctx = makeCtx(player);
    const start = new Map(sys.agents.map((a) => [a.id, a.position.clone()]));
    const airborne = new Set<string>();
    for (let i = 0; i < 900; i++) {
      ctx.time += ctx.dt;
      sys.update(ctx);
      for (const a of sys.agents) if (a.active && a.airborne) airborne.add(a.rigDef.kind);
    }
    const moved = sys.agents.filter((a) => a.active && a.position.distanceTo(start.get(a.id)!) > 0.5);
    expect(new Set(moved.map((a) => a.profile.cls)).size).toBeGreaterThanOrEqual(2);
    expect(airborne.has('butterfly') || airborne.has('bee')).toBe(true);
    // Walkers stay on the ground; flyers leave it.
    for (const a of sys.agents) {
      if (a.active && a.profile.cls === 'walker') expect(Math.abs(a.position.y - world.heightAt(a.position.x, a.position.z)), a.id).toBeLessThan(0.01);
    }
    sys.dispose();
  });

  it('only simulates animals near the player', () => {
    const sys = new WildlifeSystem();
    sys.update(makeCtx(new Vector3(0, 0, 60)));
    expect(sys.activeCount).toBeGreaterThan(0);
    expect(sys.activeCount).toBeLessThan(sys.agents.length);
    const far = sys.agents.find((a) => a.speciesId === 'buceros-bicornis')!;
    expect(far.active).toBe(false);
    sys.dispose();
  });
});
