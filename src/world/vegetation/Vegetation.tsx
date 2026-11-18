/**
 * Streams and renders vegetation. Every plant model is one InstancedMesh; the
 * instance buffers are rebuilt only when the player crosses a chunk boundary or
 * a graphics setting changes. Near chunks get full-detail trees, understory and
 * grass; far chunks get low-poly trees only. The same pass publishes targetable
 * plants and sight blockers to the registry.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type MeshStandardMaterial } from 'three';
import { DRAW_DISTANCE, WORLD } from '../../config';
import { BIOMES } from '../../data/biomes/biomes';
import { createWindMaterial, windUniforms } from '../../engine/rendering/windMaterial';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import type { Blocker, TargetCandidate } from '../../systems/identification/targeting';
import { mulberry32 } from '../../utils/rng';
import { registry } from '../registry';
import { chunkCoord, chunkKey, chunkOrigin, chunksAround } from '../streaming/chunks';
import { getWorld } from '../terrain/heightmap';
import { FLATTEN_SPOTS } from '../terrain/layout';
import { getChunkContent, trimChunkCache, type PlantInstance } from './placement';
import { PLANT_META, getPlantGeometry } from './plantModels';

interface Batch {
  mesh: InstancedMesh;
  capacity: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

const DECOR_CELL = 1.15;
const DECOR_STRIDE = 9;
type DecorKind = 'grass' | 'wildflower' | 'reed' | 'waterweed';
const DECOR_KINDS: readonly DecorKind[] = ['grass', 'wildflower', 'reed', 'waterweed'];
type Decor = Record<DecorKind, Float32Array>;
const decorCache = new Map<number, Decor>();
const FLOWER_TINTS: [number, number, number][] = [
  [1, 1, 1],
  [1, 0.86, 0.3],
  [0.78, 0.6, 0.95],
  [1, 0.62, 0.78],
];

/**
 * Decorative ground cover for a chunk: grass tufts and wildflower drifts on land,
 * reed beds along the waterline, weeds on the river and lake bed.
 * Each entry is [x, y, z, rot, scale, r, g, b, rank]; `rank` is compared with the density setting.
 */
function decorForChunk(cx: number, cz: number): Decor {
  const key = chunkKey(cx, cz);
  const hit = decorCache.get(key);
  if (hit) return hit;
  const world = getWorld();
  const rnd = mulberry32((WORLD.seed ^ Math.imul(key + 7, 0x9e3779b1)) >>> 0);
  const n = Math.floor(WORLD.chunkSize / DECOR_CELL);
  const out: Record<DecorKind, number[]> = { grass: [], wildflower: [], reed: [], waterweed: [] };
  const ox = chunkOrigin(cx);
  const oz = chunkOrigin(cz);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const jx = rnd();
      const jz = rnd();
      const roll = rnd();
      const rot = rnd() * Math.PI * 2;
      const sc = rnd();
      const x = ox + (i + jx) * DECOR_CELL;
      const z = oz + (j + jz) * DECOR_CELL;
      const h = world.heightAt(x, z);
      // Broad patches, so cover comes in drifts and beds rather than evenly.
      const patch = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 1.7) * Math.sin(z * 0.13 + Math.sin(x * 0.05) * 1.3);
      if (h < -0.7) {
        const s = Math.min(1.3, (-h - 0.15) / 0.85) * (0.6 + sc * 0.4);
        if (roll < 0.34 && patch > -0.15 && s > 0.3) out.waterweed.push(x, h - 0.03, z, rot, s, 0.9, 1, 0.9, roll / 0.34);
        continue;
      }
      const slope = world.slopeAt(x, z);
      if (h < 0.32) {
        if (h > -0.5 && roll < 0.42 && patch > 0.05 && slope < 0.3) out.reed.push(x, h - 0.05, z, rot, 0.75 + sc * 0.6, 0.95, 1, 0.92, roll / 0.42);
        continue;
      }
      const biome = BIOMES[world.biomeAt(x, z)];
      if (roll > biome.grass || slope > 0.36) continue;
      let blocked = false;
      for (const s of FLATTEN_SPOTS) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.8) blocked = true;
      if (blocked) continue;
      const rank = roll / Math.max(0.01, biome.grass);
      const open = biome.id === 'grassland' || biome.id === 'mountain';
      if (open && patch > 0.42 && sc < 0.3) {
        const tint = FLOWER_TINTS[Math.abs(Math.floor(x * 0.045) + Math.floor(z * 0.045) * 3) % FLOWER_TINTS.length]!;
        out.wildflower.push(x, h - 0.02, z, rot, 0.6 + sc * 1.1, tint[0], tint[1], tint[2], rank);
        continue;
      }
      // Sun-dried patches in the open, deeper green under the canopy.
      const dry = open ? 0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(z * 0.037) * 2.1) : 0;
      const shade = open ? 1 : 0.7;
      out.grass.push(x, h - 0.03, z, rot, (open ? 0.7 : 0.55) + sc * 0.8, shade * (0.92 + dry * 0.22), shade * (0.98 + dry * 0.05), shade * (0.9 - dry * 0.22), rank);
    }
  }
  const decor: Decor = { grass: new Float32Array(out.grass), wildflower: new Float32Array(out.wildflower), reed: new Float32Array(out.reed), waterweed: new Float32Array(out.waterweed) };
  decorCache.set(key, decor);
  if (decorCache.size > 40) decorCache.delete(decorCache.keys().next().value!);
  return decor;
}

export function Vegetation(): React.JSX.Element {
  const group = useRef<Group>(null);
  const density = useGame((s) => s.settings.vegetation);
  const drawDistance = useGame((s) => s.settings.drawDistance);
  const shadows = useGame((s) => s.settings.shadows);
  const quality = useGame((s) => s.settings.quality);

  const plain = quality === 'low';
  const state = useMemo(() => {
    return {
      material: createWindMaterial(0.86, plain) as MeshStandardMaterial,
      rockMaterial: createWindMaterial(0.95, plain) as MeshStandardMaterial,
      batches: new Map<string, Batch>(),
      signature: '',
    };
  }, [plain]);

  useEffect(() => {
    const g = group.current;
    return () => {
      for (const b of state.batches.values()) {
        g?.remove(b.mesh);
        b.mesh.dispose();
      }
      state.batches.clear();
      state.signature = '';
      state.material.dispose();
      state.rockMaterial.dispose();
      registry.plants = [];
      registry.plantBlockers = [];
    };
  }, [state]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const px = runtime.player.pos.x;
    const pz = runtime.player.pos.z;
    const signature = `${chunkKey(chunkCoord(px), chunkCoord(pz))}|${density}|${drawDistance}|${shadows}|${quality}`;
    if (signature === state.signature) return;
    state.signature = signature;

    const rings = DRAW_DISTANCE[drawDistance];
    // Low preset: solid canopies and a short grass range keep fill cost down on weak GPUs.
    const simple = quality === 'low';
    const lodTag = simple ? 's' : 'c';
    windUniforms.uGrassFar.value = simple ? 34 : quality === 'medium' ? 80 : 115;
    const lists = new Map<string, PlantInstance[]>();
    const push = (id: string, p: PlantInstance): void => {
      const key = `${id}:${lodTag}`;
      let l = lists.get(key);
      if (!l) lists.set(key, (l = []));
      l.push(p);
    };
    const targets: TargetCandidate[] = [];
    const blockers: Blocker[] = [];
    const decor: Decor[] = [];
    const active = chunksAround(px, pz, rings.far);
    const keep = new Set<number>();
    let plantCount = 0;

    for (const c of active) {
      keep.add(c.key);
      const content = getChunkContent(c.cx, c.cz);
      const near = c.ring <= rings.near;
      // Full-detail trees are by far the largest triangle cost. Only High keeps them out to the
      // second ring; Medium swaps to the far model one ring sooner (understory still fills ring two).
      const detailed = c.ring <= Math.min(rings.near, quality === 'high' ? 2 : 1);
      for (const t of content.trees) {
        const meta = PLANT_META[t.speciesId]!;
        push(detailed ? `${t.speciesId}:hi` : `${t.speciesId}:low`, t);
        if (near) {
          targets.push({ id: t.id, kind: 'plant', speciesId: t.speciesId, x: t.x, y: t.y + meta.centerY * t.scale, z: t.z, radius: meta.radius * t.scale });
          blockers.push({ kind: 'cylinder', x: t.x, z: t.z, y0: t.y, y1: t.y + meta.height * t.scale * 0.6, r: meta.trunkRadius * t.scale, owner: t.id });
        }
      }
      if (!near) continue;
      for (const p of content.plants) {
        if (p.rank > density) continue;
        const meta = PLANT_META[p.speciesId]!;
        push(`${p.speciesId}:hi`, p);
        targets.push({ id: p.id, kind: 'plant', speciesId: p.speciesId, x: p.x, y: p.y + meta.centerY * p.scale, z: p.z, radius: meta.radius * p.scale });
      }
      for (const r of content.rocks) {
        push('rock:hi', r);
        if (r.scale > 0.6) blockers.push({ kind: 'sphere', x: r.x, y: r.y + 0.36 * r.scale, z: r.z, r: 0.78 * r.scale, owner: r.id });
      }
      if (c.ring <= 1) decor.push(decorForChunk(c.cx, c.cz));
    }
    trimChunkCache(keep);

    const castShadows = shadows !== 'off';
    const used = new Set<string>();
    for (const [key, list] of lists) {
      used.add(key);
      const [id, lod] = key.split(':') as [string, string];
      const meta = PLANT_META[id]!;
      let batch = state.batches.get(key);
      if (!batch || batch.capacity < list.length) {
        if (batch) {
          g.remove(batch.mesh);
          batch.mesh.dispose();
        }
        const capacity = Math.ceil(list.length * 1.4) + 16;
        const mesh = new InstancedMesh(getPlantGeometry(id, lod === 'low', simple), id === 'rock' ? state.rockMaterial : state.material, capacity);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = `veg-${key}`;
        batch = { mesh, capacity };
        state.batches.set(key, batch);
        g.add(mesh);
      }
      const mesh = batch.mesh;
      mesh.castShadow = castShadows && meta.castShadow && lod !== 'low';
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        _q.setFromAxisAngle(_up, p.rot);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.scale));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.setScalar(p.tint));
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      plantCount += list.length;
    }

    // Decorative ground cover.
    for (const kind of DECOR_KINDS) {
      // Flower drifts and river weed are textured cards only; the Low preset leaves them out.
      if (simple && (kind === 'wildflower' || kind === 'waterweed')) continue;
      let total = 0;
      for (const d of decor) total += d[kind].length / DECOR_STRIDE;
      if (total === 0) continue;
      const bkey = `${kind}:${lodTag}`;
      used.add(bkey);
      let batch = state.batches.get(bkey);
      if (!batch || batch.capacity < total) {
        if (batch) {
          g.remove(batch.mesh);
          batch.mesh.dispose();
        }
        const capacity = Math.ceil(total * 1.3) + 64;
        const mesh = new InstancedMesh(getPlantGeometry(kind, false, simple), state.material, capacity);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = `veg-${kind}`;
        batch = { mesh, capacity };
        state.batches.set(bkey, batch);
        g.add(mesh);
      }
      let n = 0;
      for (const d of decor) {
        const a = d[kind];
        for (let k = 0; k < a.length; k += DECOR_STRIDE) {
          if (a[k + 8]! > density * (simple ? 0.55 : 1)) continue;
          _q.setFromAxisAngle(_up, a[k + 3]!);
          _m.compose(_p.set(a[k]!, a[k + 1]!, a[k + 2]!), _q, _s.setScalar(a[k + 4]!));
          batch.mesh.setMatrixAt(n, _m);
          batch.mesh.setColorAt(n, _c.setRGB(a[k + 5]!, a[k + 6]!, a[k + 7]!));
          n++;
        }
      }
      batch.mesh.count = n;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      plantCount += n;
    }
    for (const [key, b] of state.batches) if (!used.has(key)) b.mesh.count = 0;

    registry.plants = targets;
    registry.plantBlockers = blockers;
    registry.vegetationVersion++;
    runtime.perf.plants = plantCount;
    runtime.perf.chunks = active.length;
  }, -4);

  return <group ref={group} name="vegetation" />;
}
