/**
 * Wildlife simulation. Owns every animal agent, activates only those near the
 * player, throttles distant ones and drives the behaviour state machines and
 * locomotion controllers. Rendering objects are plain Three.js groups managed
 * here so the per-frame path never touches React.
 */
import { Group, Vector3 } from 'three';
import { WORLD } from '../../config';
import { requireSpecies } from '../../data/species';
import { clamp, damp, dampAngle, dist2, lerp } from '../../utils/math';
import { mulberry32 } from '../../utils/rng';
import { chunkCoord } from '../../world/streaming/chunks';
import { getWorld, type WorldData } from '../../world/terrain/heightmap';
import { getChunkContent, type PlantInstance } from '../../world/vegetation/placement';
import { PLANT_META } from '../../world/vegetation/plantModels';
import { animateRig, type AnimState } from './animation';
import { activityLevel, behaviorDuration, decideBehavior, isCalm } from './behavior';
import { createRig, getRigDef, type RigDef, type RigInstance } from './models';
import { HABITATS, PROFILES } from './profiles';
import type { Behavior, Perception, SpeciesProfile, WildlifeAgent } from './types';

export interface Agent extends WildlifeAgent {
  profile: SpeciesProfile;
  rigDef: RigDef;
  home: { x: number; z: number; r: number };
  group: number;
  heading: number;
  speed: number;
  stateTime: number;
  stateDuration: number;
  thirst: number;
  /** Seconds of tolerance left towards a quiet observer. */
  habituation: number;
  alertSeconds: number;
  target: Vector3;
  hasTarget: boolean;
  atTarget: boolean;
  /** Flight interpolation for birds. */
  flightFrom: Vector3;
  flightT: number;
  flightDur: number;
  flightArc: number;
  vel: Vector3;
  pitch: number;
  bank: number;
  airborne: boolean;
  callTimer: number;
  rng: () => number;
  rig: RigInstance | null;
  accum: number;
  seed: number;
}

export interface SimContext {
  /** Simulation dt (already scaled by slow motion). */
  dt: number;
  time: number;
  player: Vector3;
  playerSpeed: number;
  playerCrouching: boolean;
  playerInWater: boolean;
  camera: Vector3;
  hour: number;
  raining: boolean;
  foggy: boolean;
  activeRadius: number;
}

interface School {
  x: number;
  z: number;
  tx: number;
  tz: number;
  timer: number;
}

const _v = new Vector3();
const anim: AnimState = { behavior: 'idle', speed: 0, runSpeed: 1, time: 0, airborne: false, pitch: 0, bank: 0, atTarget: false };

export class WildlifeSystem {
  readonly group = new Group();
  readonly agents: Agent[] = [];
  private readonly byId = new Map<string, Agent>();
  private readonly schools = new Map<number, School>();
  private readonly world: WorldData;
  private shore: Float32Array | null = null;
  private frame = 0;
  activeCount = 0;
  /** Fired when an animal vocalises (used for spatial audio). */
  onCall: ((agent: Agent) => void) | null = null;

  constructor() {
    this.world = getWorld();
    this.group.name = 'wildlife';
    this.spawnAll();
  }

  /* ---------------- spawning ---------------- */

  private validSpot(profile: SpeciesProfile, x: number, z: number): boolean {
    if (Math.abs(x) > WORLD.playLimit || Math.abs(z) > WORLD.playLimit) return false;
    const h = this.world.heightAt(x, z);
    if (profile.cls === 'fish') return h < -0.8;
    if (profile.perch === 'shallows') return h > -0.4 && h < -0.06;
    if (profile.cls === 'walker') return h > 0.25 && this.world.slopeAt(x, z) < 0.5;
    return true;
  }

  private spawnAll(): void {
    HABITATS.forEach((hab, groupIndex) => {
      const profile = PROFILES[hab.speciesId];
      if (!profile) throw new Error(`No behaviour profile for ${hab.speciesId}`);
      const species = requireSpecies(hab.speciesId);
      const rnd = mulberry32(WORLD.seed + groupIndex * 7919);
      for (let i = 0; i < hab.count; i++) {
        let x = hab.x;
        let z = hab.z;
        for (let t = 0; t < 60; t++) {
          const a = rnd() * Math.PI * 2;
          const d = Math.sqrt(rnd()) * hab.radius * (t < 40 ? 1 : 1.6);
          const cx = hab.x + Math.cos(a) * d;
          const cz = hab.z + Math.sin(a) * d;
          if (this.validSpot(profile, cx, cz)) {
            x = cx;
            z = cz;
            break;
          }
        }
        const seed = WORLD.seed + groupIndex * 1000 + i;
        const h = this.world.heightAt(x, z);
        const y = profile.cls === 'fish' ? clamp(h + 0.4, h + 0.2, -0.25) : Math.max(h, profile.cls === 'insect' ? Math.max(h, 0) + 0.8 : h);
        const rigDef = getRigDef(species.model, i === 0 ? 0 : 1 + (i % 2 === 0 ? 1 : 0));
        const agent: Agent = {
          id: `${hab.speciesId}#${groupIndex}.${i}`,
          speciesId: hab.speciesId,
          position: new Vector3(x, y, z),
          homeRegion: this.world.biomeAt(hab.x, hab.z),
          currentBehavior: profile.cls === 'fish' ? 'swimming' : profile.cls === 'soarer' ? 'soaring' : profile.cls === 'bird' ? 'perched' : 'idle',
          movementSpeed: profile.walkSpeed,
          awarenessRadius: profile.awareness,
          preferredHabitat: species.habitats,
          active: false,
          profile,
          rigDef,
          home: { x: hab.x, z: hab.z, r: hab.radius },
          group: groupIndex,
          heading: rnd() * Math.PI * 2,
          speed: 0,
          stateTime: 0,
          stateDuration: 1 + rnd() * 5,
          thirst: rnd() * 0.6,
          habituation: 0,
          alertSeconds: 0,
          target: new Vector3(x, y, z),
          hasTarget: false,
          atTarget: true,
          flightFrom: new Vector3(x, y, z),
          flightT: 1,
          flightDur: 1,
          flightArc: 0,
          vel: new Vector3(),
          pitch: 0,
          bank: 0,
          airborne: profile.cls === 'soarer',
          callTimer: profile.callInterval ? profile.callInterval[0] * rnd() + 4 : Infinity,
          rng: mulberry32(seed),
          rig: null,
          accum: 0,
          seed,
        };
        this.agents.push(agent);
        this.byId.set(agent.id, agent);
      }
      if (profile.cls === 'fish') this.schools.set(groupIndex, { x: hab.x, z: hab.z, tx: hab.x, tz: hab.z, timer: 0 });
    });
  }

  get(id: string): Agent | undefined {
    return this.byId.get(id);
  }

  /* ---------------- helpers ---------------- */

  /** Lazily builds a list of drinking spots along every shoreline. */
  private nearestShore(x: number, z: number, maxDist: number): [number, number] | null {
    if (!this.shore) {
      const pts: number[] = [];
      for (let j = 0; j < WORLD.grid; j += 3) {
        for (let i = 0; i < WORLD.grid; i += 3) {
          const h = this.world.gridHeight(i, j);
          if (h > -0.02 && h < 0.22) pts.push(-WORLD.half + i * WORLD.cell, -WORLD.half + j * WORLD.cell);
        }
      }
      this.shore = new Float32Array(pts);
    }
    let best = maxDist * maxDist;
    let out: [number, number] | null = null;
    for (let k = 0; k < this.shore.length; k += 2) {
      const dx = this.shore[k]! - x;
      const dz = this.shore[k + 1]! - z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        out = [this.shore[k]!, this.shore[k + 1]!];
      }
    }
    return out;
  }

  private randomHomePoint(a: Agent, away?: Vector3): [number, number] {
    for (let t = 0; t < 24; t++) {
      const ang = a.rng() * Math.PI * 2;
      const d = Math.sqrt(a.rng()) * a.home.r;
      const x = a.home.x + Math.cos(ang) * d;
      const z = a.home.z + Math.sin(ang) * d;
      if (!this.validSpot(a.profile, x, z)) continue;
      if (away && dist2(x, z, away.x, away.z) < a.profile.fleeDistance * 2.5 && t < 16) continue;
      return [x, z];
    }
    return [a.home.x, a.home.z];
  }

  private plantsNear(x: number, z: number): { trees: PlantInstance[]; plants: PlantInstance[]; rocks: PlantInstance[] } {
    return getChunkContent(chunkCoord(x), chunkCoord(z));
  }

  /** Finds somewhere for a bird to land, according to the species' perch habit. */
  private findPerch(a: Agent, away?: Vector3): void {
    const kind = a.profile.perch ?? 'tree';
    for (let t = 0; t < 10; t++) {
      const [x, z] = this.randomHomePoint(a, away);
      if (kind === 'shallows') {
        a.target.set(x, this.world.heightAt(x, z), z);
        return;
      }
      const content = this.plantsNear(x, z);
      let pool: PlantInstance[];
      if (kind === 'waterside') {
        pool = [...content.plants, ...content.rocks, ...content.trees].filter((p) => {
          const h = this.world.heightAt(p.x, p.z);
          return h > -1.4 && h < 1.6 && (PLANT_META[p.speciesId]?.height ?? 0) * p.scale < 13;
        });
      } else {
        pool = [...content.trees, ...content.plants.filter((p) => (PLANT_META[p.speciesId]?.height ?? 0) >= 1.3)];
      }
      if (pool.length === 0) continue;
      const want = (a.profile.flightHeight ?? 4) * 2.2;
      pool.sort((p, q) => Math.abs(PLANT_META[p.speciesId]!.height * p.scale - want) - Math.abs(PLANT_META[q.speciesId]!.height * q.scale - want));
      const pick = pool[Math.floor(a.rng() * Math.min(4, pool.length))]!;
      const meta = PLANT_META[pick.speciesId]!;
      const top = meta.kind === 'rock' ? 0.62 * pick.scale : meta.height * pick.scale * (meta.kind === 'tree' ? 0.94 : 0.9);
      const off = meta.kind === 'tree' ? meta.radius * 0.25 * pick.scale : 0;
      a.target.set(pick.x + (a.rng() - 0.5) * off, pick.y + top, pick.z + (a.rng() - 0.5) * off);
      return;
    }
    const [x, z] = this.randomHomePoint(a, away);
    a.target.set(x, Math.max(0, this.world.heightAt(x, z)), z);
  }

  private startFlight(a: Agent, away?: Vector3): void {
    this.findPerch(a, away);
    a.flightFrom.copy(a.position);
    const d = a.position.distanceTo(a.target);
    const speed = away ? a.profile.runSpeed : a.profile.walkSpeed;
    a.flightDur = Math.max(0.8, d / speed);
    a.flightArc = Math.min(7, 1 + d * 0.12);
    a.flightT = 0;
    a.atTarget = false;
    a.airborne = true;
  }

  private findFlower(a: Agent): void {
    const [x, z] = this.randomHomePoint(a);
    const content = this.plantsNear(x, z);
    const flowers = content.plants.filter((p) => PLANT_META[p.speciesId]?.flower && dist2(p.x, p.z, a.home.x, a.home.z) < a.home.r * 1.5);
    const overWater = a.speciesId === 'crocothemis-servilia';
    if (flowers.length > 0 && !overWater && a.rng() < 0.85) {
      const f = flowers[Math.floor(a.rng() * flowers.length)]!;
      const meta = PLANT_META[f.speciesId]!;
      a.target.set(f.x + (a.rng() - 0.5) * 0.5 * f.scale, f.y + meta.height * f.scale * 0.92, f.z + (a.rng() - 0.5) * 0.5 * f.scale);
      return;
    }
    const ground = Math.max(this.world.heightAt(x, z), WORLD.waterLevel);
    a.target.set(x, ground + (a.profile.flightHeight ?? 1) * (0.5 + a.rng()), z);
  }

  private enter(a: Agent, b: Behavior, ctx: SimContext): void {
    const prev = a.currentBehavior;
    a.currentBehavior = b;
    a.stateTime = 0;
    a.stateDuration = behaviorDuration(b, a.rng());
    const p = a.profile;
    if (p.cls === 'walker') {
      a.atTarget = false;
      a.hasTarget = false;
      if (b === 'walking') {
        const [x, z] = this.randomHomePoint(a);
        a.target.set(x, 0, z);
        a.hasTarget = true;
      } else if (b === 'returning') {
        a.target.set(a.home.x + (a.rng() - 0.5) * a.home.r * 0.5, 0, a.home.z + (a.rng() - 0.5) * a.home.r * 0.5);
        a.hasTarget = true;
      } else if (b === 'drinking') {
        const s = this.nearestShore(a.position.x, a.position.z, 170);
        if (s) {
          a.target.set(s[0], 0, s[1]);
          a.hasTarget = true;
          a.stateDuration += 60;
        } else {
          a.currentBehavior = 'feeding';
        }
        a.thirst = 0;
      } else if (b === 'fleeing' && prev !== 'fleeing' && p.voice) {
        this.onCall?.(a);
      }
    } else if (p.cls === 'bird') {
      if (b === 'flying') this.startFlight(a, ctx.player.distanceTo(a.position) < p.fleeDistance * 2 ? ctx.player : undefined);
      else if (b === 'calling') this.onCall?.(a);
    } else if (p.cls === 'insect') {
      if (b === 'flying') {
        this.findFlower(a);
        a.atTarget = false;
        a.airborne = true;
      } else if (b === 'resting') {
        const content = this.plantsNear(a.position.x, a.position.z);
        const near = content.plants.find((q) => dist2(q.x, q.z, a.position.x, a.position.z) < 6);
        if (near) a.target.set(near.x, near.y + PLANT_META[near.speciesId]!.height * near.scale * 0.8, near.z);
        else a.target.set(a.position.x, Math.max(this.world.heightAt(a.position.x, a.position.z), 0) + 0.05, a.position.z);
        a.atTarget = false;
      }
    }
  }

  /* ---------------- controllers ---------------- */

  private perceive(a: Agent, ctx: SimContext, playerDistance: number): Perception {
    const p = a.profile;
    const rainy = ctx.raining && (p.cls === 'insect' || p.cls === 'bird' || p.cls === 'soarer');
    return {
      playerDistance,
      playerSpeed: ctx.playerSpeed,
      playerCrouching: ctx.playerCrouching,
      timeInState: a.stateTime,
      stateDuration: a.stateDuration,
      distanceFromHome: dist2(a.position.x, a.position.z, a.home.x, a.home.z),
      homeRadius: a.home.r,
      activity: activityLevel(p.activity, ctx.hour) * (rainy ? 0.6 : 1),
      thirst: a.thirst,
      roll: a.rng(),
      raining: ctx.raining,
      foggy: ctx.foggy,
      atTarget: a.atTarget,
      habituated: a.habituation > 0,
      disturbed: p.cls === 'fish' && playerDistance < p.fleeDistance && (ctx.playerInWater || ctx.playerSpeed > 3.2),
    };
  }

  private walker(a: Agent, ctx: SimContext, dt: number): void {
    const p = a.profile;
    const pos = a.position;
    const b = a.currentBehavior;
    let speedTarget = 0;
    let desired = a.heading;
    let turn = 3;
    if (b === 'fleeing') {
      desired = Math.atan2(pos.x - ctx.player.x, pos.z - ctx.player.z) + Math.sin(a.seed + ctx.time * 0.7) * 0.5;
      speedTarget = p.runSpeed;
      turn = 7;
    } else if (b === 'alert') {
      desired = Math.atan2(ctx.player.x - pos.x, ctx.player.z - pos.z);
      turn = 5;
    } else if (a.hasTarget && !a.atTarget) {
      const dx = a.target.x - pos.x;
      const dz = a.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < Math.max(0.5, a.rigDef.radius * 0.8)) {
        a.atTarget = true;
        if (b === 'walking') a.stateTime = a.stateDuration;
        if (b === 'drinking') {
          a.stateTime = 0;
          a.stateDuration = 6 + a.rng() * 5;
        }
      } else {
        desired = Math.atan2(dx, dz);
        speedTarget = b === 'returning' ? p.walkSpeed * 1.35 : b === 'drinking' ? p.walkSpeed * 1.15 : p.walkSpeed;
      }
    }
    a.heading = dampAngle(a.heading, desired, turn, dt);
    a.speed = damp(a.speed, speedTarget, speedTarget > a.speed ? 4 : 6, dt);
    if (a.speed > 0.01) {
      const nx = pos.x + Math.sin(a.heading) * a.speed * dt;
      const nz = pos.z + Math.cos(a.heading) * a.speed * dt;
      const h = this.world.heightAt(nx, nz);
      const blocked = h < -0.18 || Math.abs(nx) > WORLD.playLimit || Math.abs(nz) > WORLD.playLimit || (this.world.slopeAt(nx, nz) > 0.62 && h > pos.y);
      if (blocked) {
        a.heading += (a.seed % 2 === 0 ? 1 : -1) * 2.4 * dt;
        a.speed *= 0.6;
        if (b === 'walking' || b === 'returning') {
          const [x, z] = this.randomHomePoint(a);
          a.target.set(x, 0, z);
        }
      } else {
        pos.x = nx;
        pos.z = nz;
        // Keep bodies out of tree trunks.
        const body = a.rigDef.radius * 0.35;
        for (const t of this.plantsNear(nx, nz).trees) {
          const r = (PLANT_META[t.speciesId]?.trunkRadius ?? 0) * t.scale + body;
          const dx = pos.x - t.x;
          const dz = pos.z - t.z;
          const d = Math.hypot(dx, dz);
          if (d < r && d > 1e-4) {
            pos.x = t.x + (dx / d) * r;
            pos.z = t.z + (dz / d) * r;
          }
        }
      }
    }
    pos.y = this.world.heightAt(pos.x, pos.z);
    a.thirst = Math.min(1, a.thirst + dt / 110);
    a.airborne = false;
    a.pitch = 0;
  }

  private bird(a: Agent, ctx: SimContext, dt: number): void {
    const pos = a.position;
    if (a.currentBehavior === 'flying') {
      a.flightT = Math.min(1, a.flightT + dt / a.flightDur);
      const t = a.flightT;
      const e = t * t * (3 - 2 * t);
      const px = pos.x;
      const pz = pos.z;
      const py = pos.y;
      pos.x = lerp(a.flightFrom.x, a.target.x, e);
      pos.z = lerp(a.flightFrom.z, a.target.z, e);
      pos.y = lerp(a.flightFrom.y, a.target.y, e) + Math.sin(Math.PI * t) * a.flightArc;
      const dx = pos.x - px;
      const dz = pos.z - pz;
      if (Math.hypot(dx, dz) > 1e-4) {
        const want = Math.atan2(dx, dz);
        a.bank = clamp(-(want - a.heading) * 2, -0.6, 0.6);
        a.heading = dampAngle(a.heading, want, 8, dt);
      }
      a.speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      a.pitch = dt > 0 ? clamp(Math.atan2(pos.y - py, Math.max(1e-4, Math.hypot(dx, dz))), -0.8, 0.8) : 0;
      if (t >= 1) {
        a.atTarget = true;
        a.airborne = false;
        a.speed = 0;
        a.bank = 0;
      }
      return;
    }
    a.airborne = false;
    a.speed = 0;
    if (a.currentBehavior === 'alert') {
      a.heading = dampAngle(a.heading, Math.atan2(ctx.player.x - pos.x, ctx.player.z - pos.z), 4, dt);
    } else if (a.profile.perch === 'shallows' && a.currentBehavior === 'feeding') {
      // Wading: slow steps through the shallows between strikes.
      const step = Math.sin(ctx.time * 0.5 + a.seed) > 0.4 ? 0.22 : 0;
      const nx = pos.x + Math.sin(a.heading) * step * dt;
      const nz = pos.z + Math.cos(a.heading) * step * dt;
      const h = this.world.heightAt(nx, nz);
      if (h > -0.4 && h < -0.04) {
        pos.x = nx;
        pos.z = nz;
        pos.y = h;
        a.speed = step;
      } else {
        a.heading += 1.5 * dt;
      }
    }
  }

  private soarer(a: Agent, ctx: SimContext, dt: number): void {
    const pos = a.position;
    if (a.currentBehavior === 'resting') {
      const gx = a.home.x + Math.cos(a.seed) * 12;
      const gz = a.home.z + Math.sin(a.seed) * 12;
      _v.set(gx, this.world.heightAt(gx, gz) + 0.2, gz);
      pos.lerp(_v, 1 - Math.exp(-0.6 * dt));
      a.airborne = pos.distanceTo(_v) > 1.5;
      a.speed = a.airborne ? a.profile.walkSpeed : 0;
      return;
    }
    const radius = a.home.r * (0.55 + 0.3 * Math.sin(a.seed * 1.7));
    const w = a.profile.walkSpeed / radius;
    const ang = ctx.time * w * (a.seed % 2 === 0 ? 1 : -1) + a.seed;
    const tx = a.home.x + Math.cos(ang) * radius;
    const tz = a.home.z + Math.sin(ang) * radius;
    const ty = Math.max(this.world.heightAt(tx, tz), this.world.heightAt(a.home.x, a.home.z)) + (a.profile.flightHeight ?? 50) * 0.55 + Math.sin(ctx.time * 0.11 + a.seed) * 9;
    const px = pos.x;
    const pz = pos.z;
    pos.x = damp(pos.x, tx, 1.5, dt);
    pos.z = damp(pos.z, tz, 1.5, dt);
    pos.y = damp(pos.y, ty, 0.6, dt);
    const want = Math.atan2(pos.x - px, pos.z - pz);
    a.heading = dampAngle(a.heading, want, 4, dt);
    a.bank = (a.seed % 2 === 0 ? -1 : 1) * 0.35;
    a.airborne = true;
    a.speed = a.profile.walkSpeed;
    a.pitch = 0;
  }

  private insect(a: Agent, ctx: SimContext, dt: number): void {
    const pos = a.position;
    const p = a.profile;
    const b = a.currentBehavior;
    const travelling = b === 'flying' || (b === 'resting' && !a.atTarget);
    if (travelling) {
      _v.copy(a.target).sub(pos);
      const d = _v.length();
      if (d < 0.22) {
        a.atTarget = true;
        a.vel.multiplyScalar(0.2);
      } else {
        const fleeing = ctx.player.distanceTo(pos) < p.fleeDistance;
        _v.multiplyScalar(((fleeing ? p.runSpeed : p.walkSpeed) * Math.min(1, d / 0.8 + 0.25)) / d);
        if (a.rigDef.kind === 'butterfly') {
          // Butterflies never fly straight: add the characteristic flutter.
          const s = ctx.time * 5 + a.seed;
          _v.x += Math.cos(a.heading) * Math.sin(s) * 0.9;
          _v.z -= Math.sin(a.heading) * Math.sin(s) * 0.9;
          _v.y += Math.sin(s * 1.7) * 0.7;
        } else if (a.rigDef.kind === 'bee') {
          _v.y += Math.sin(ctx.time * 9 + a.seed) * 0.25;
        }
        a.vel.x = damp(a.vel.x, _v.x, 4, dt);
        a.vel.y = damp(a.vel.y, _v.y, 4, dt);
        a.vel.z = damp(a.vel.z, _v.z, 4, dt);
      }
      a.airborne = !a.atTarget;
    } else if (b === 'hovering') {
      const s = ctx.time * 3 + a.seed;
      a.vel.set(Math.sin(s) * 0.25, Math.sin(s * 1.9) * 0.15, Math.cos(s * 1.3) * 0.25);
      a.airborne = true;
    } else {
      // Feeding or settled: sit on the flower.
      a.vel.multiplyScalar(Math.exp(-8 * dt));
      pos.lerp(a.target, 1 - Math.exp(-6 * dt));
      a.airborne = false;
    }
    pos.addScaledVector(a.vel, dt);
    const floor = Math.max(this.world.heightAt(pos.x, pos.z), WORLD.waterLevel) + 0.05;
    if (pos.y < floor) pos.y = floor;
    const hs = Math.hypot(a.vel.x, a.vel.z);
    a.speed = a.vel.length();
    if (hs > 0.08) {
      const want = Math.atan2(a.vel.x, a.vel.z);
      a.bank = clamp(-(want - a.heading), -0.5, 0.5);
      a.heading = dampAngle(a.heading, want, 7, dt);
    }
    a.pitch = clamp(Math.atan2(a.vel.y, Math.max(0.2, hs)), -0.6, 0.6);
  }

  private fish(a: Agent, ctx: SimContext, dt: number): void {
    const pos = a.position;
    const p = a.profile;
    const school = this.schools.get(a.group)!;
    const b = a.currentBehavior;
    // Each fish keeps a slot around the school centre that slowly rotates.
    const slot = a.seed * 2.399 + ctx.time * 0.12;
    const spread = 0.6 + (a.seed % 5) * 0.32;
    let tx = school.x + Math.cos(slot) * spread;
    let tz = school.z + Math.sin(slot) * spread;
    let speedTarget = p.walkSpeed;
    if (b === 'fleeing') {
      const dx = pos.x - ctx.player.x;
      const dz = pos.z - ctx.player.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = pos.x + (dx / d) * 6;
      tz = pos.z + (dz / d) * 6;
      speedTarget = p.runSpeed;
    } else if (b === 'resting') {
      speedTarget = p.walkSpeed * 0.12;
    } else if (b === 'feeding') {
      speedTarget = p.walkSpeed * 0.45;
    }
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    if (b !== 'fleeing') speedTarget *= clamp(d / 1.2, 0.25, 1.7);
    let want = d > 0.05 ? Math.atan2(dx, dz) : a.heading;
    // Look ahead: steer away from the shore before reaching it.
    const look = 0.6 + a.speed * 0.6;
    const ax = pos.x + Math.sin(a.heading) * look;
    const az = pos.z + Math.cos(a.heading) * look;
    const aheadDepth = -this.world.heightAt(ax, az);
    let turn = 2.6;
    if (aheadDepth < 0.7) {
      want = Math.atan2(school.x - pos.x, school.z - pos.z);
      turn = 6;
      speedTarget *= 0.6;
    }
    a.heading = dampAngle(a.heading, want, turn, dt);
    a.speed = damp(a.speed, speedTarget, 3, dt);
    const nx = pos.x + Math.sin(a.heading) * a.speed * dt;
    const nz = pos.z + Math.cos(a.heading) * a.speed * dt;
    // Hard boundary: fish never leave the water volume.
    if (-this.world.heightAt(nx, nz) > 0.5) {
      pos.x = nx;
      pos.z = nz;
    } else {
      a.speed *= 0.5;
    }
    const depth = -this.world.heightAt(pos.x, pos.z);
    const bed = -depth;
    let frac = p.swimDepth ?? 0.5;
    if (b === 'feeding') frac = a.speciesId === 'trichopodus-trichopterus' ? 0.04 : 0.9;
    const ty = clamp(lerp(-0.3, bed + 0.22, frac) + Math.sin(ctx.time * 0.4 + a.seed) * 0.08, bed + 0.16, -0.14);
    const py = pos.y;
    pos.y = damp(pos.y, ty, 1.4, dt);
    a.pitch = dt > 0 ? clamp(Math.atan2((pos.y - py) / dt, Math.max(0.15, a.speed)), -0.5, 0.5) : 0;
    a.airborne = false;
  }

  private updateSchools(dt: number): void {
    for (const [group, s] of this.schools) {
      const hab = HABITATS[group]!;
      s.timer -= dt;
      if (s.timer <= 0 || dist2(s.x, s.z, s.tx, s.tz) < 0.8) {
        for (let t = 0; t < 12; t++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * hab.radius;
          const x = hab.x + Math.cos(a) * d;
          const z = hab.z + Math.sin(a) * d;
          if (this.world.heightAt(x, z) < -1.0) {
            s.tx = x;
            s.tz = z;
            break;
          }
        }
        s.timer = 7 + Math.random() * 9;
      }
      const dx = s.tx - s.x;
      const dz = s.tz - s.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const step = Math.min(d, 0.45 * dt);
        const nx = s.x + (dx / d) * step;
        const nz = s.z + (dz / d) * step;
        if (this.world.heightAt(nx, nz) < -0.85) {
          s.x = nx;
          s.z = nz;
        } else {
          s.timer = 0;
        }
      }
    }
  }

  /* ---------------- frame update ---------------- */

  private activate(a: Agent): void {
    a.active = true;
    a.rig = createRig(a.rigDef);
    this.group.add(a.rig.root);
  }

  private deactivate(a: Agent): void {
    a.active = false;
    if (a.rig) {
      this.group.remove(a.rig.root);
      a.rig = null;
    }
  }

  update(ctx: SimContext): void {
    this.frame++;
    this.updateSchools(ctx.dt);
    let active = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]!;
      const pd = dist2(a.position.x, a.position.z, ctx.player.x, ctx.player.z);
      if (!a.active && pd < ctx.activeRadius) this.activate(a);
      else if (a.active && pd > ctx.activeRadius * 1.15) this.deactivate(a);
      if (!a.active) continue;
      active++;
      // Distant animals are simulated at a third of the rate.
      a.accum += ctx.dt;
      if (pd > 80 && (this.frame + i) % 3 !== 0) continue;
      const dt = Math.min(a.accum, 0.25);
      a.accum = 0;
      if (dt <= 0) continue;

      a.stateTime += dt;
      a.habituation = Math.max(0, a.habituation - dt);
      if (a.currentBehavior === 'alert') {
        a.alertSeconds += dt;
        // A quiet, slow observer is eventually tolerated.
        if (a.alertSeconds > 4.5 && ctx.playerSpeed < 2.2) {
          a.habituation = 25;
          a.alertSeconds = 0;
        }
      } else {
        a.alertSeconds = 0;
      }
      if (ctx.playerSpeed > 6 && pd < a.profile.awareness) a.habituation = 0;

      const next = decideBehavior(a.profile, a.currentBehavior, this.perceive(a, ctx, pd));
      if (next !== a.currentBehavior) this.enter(a, next, ctx);
      else if (a.stateTime >= a.stateDuration && isCalm(next) && a.profile.cls === 'walker' && next === 'walking') this.enter(a, next, ctx);

      switch (a.profile.cls) {
        case 'walker':
          this.walker(a, ctx, dt);
          break;
        case 'bird':
          this.bird(a, ctx, dt);
          break;
        case 'soarer':
          this.soarer(a, ctx, dt);
          break;
        case 'insect':
          this.insect(a, ctx, dt);
          break;
        case 'fish':
          this.fish(a, ctx, dt);
          break;
      }
      a.movementSpeed = a.speed;

      if (a.profile.callInterval && a.profile.cls !== 'bird') {
        a.callTimer -= dt;
        if (a.callTimer <= 0) {
          const [lo, hi] = a.profile.callInterval;
          a.callTimer = lo + a.rng() * (hi - lo);
          if (pd < 90 && isCalm(a.currentBehavior) && activityLevel(a.profile.activity, ctx.hour) > 0.35) this.onCall?.(a);
        }
      }

      const rig = a.rig!;
      rig.root.position.copy(a.position);
      rig.root.rotation.y = a.heading;
      // Animation is skipped for animals too far away to see moving parts.
      if (a.position.distanceTo(ctx.camera) < 130) {
        anim.behavior = a.currentBehavior;
        anim.speed = a.speed;
        anim.runSpeed = a.profile.runSpeed;
        anim.time = ctx.time;
        anim.airborne = a.airborne;
        anim.pitch = a.pitch;
        anim.bank = a.bank;
        anim.atTarget = a.atTarget;
        animateRig(rig, anim, dt);
      }
    }
    this.activeCount = active;
  }

  dispose(): void {
    for (const a of this.agents) this.deactivate(a);
    this.group.clear();
  }
}
