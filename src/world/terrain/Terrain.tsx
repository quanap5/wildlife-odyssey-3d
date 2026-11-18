/**
 * Chunked terrain renderer. All 256 chunks stay visible so distant mountains
 * frame the view, but each chunk's mesh resolution follows its distance from
 * the player (2 m / 4 m / 8 m grid). Skirts hide cracks between LOD levels.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { WORLD } from '../../config';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { chunkCoord, chunkKey, chunkOrigin, terrainLodStep } from '../streaming/chunks';
import { getWorld, type WorldData } from './heightmap';
import { createTerrainMaterial } from './terrainMaterial';

const SKIRT = 6;

/** Builds one chunk mesh at a grid step of 1, 2 or 4 cells. */
export function buildChunkGeometry(world: WorldData, cx: number, cz: number, step: number): BufferGeometry {
  const n = WORLD.chunkCells / step;
  const side = n + 1;
  const gi0 = cx * WORLD.chunkCells;
  const gj0 = cz * WORLD.chunkCells;
  const ox = chunkOrigin(cx);
  const oz = chunkOrigin(cz);
  const vertCount = side * side + side * 4;
  const pos = new Float32Array(vertCount * 3);
  const nor = new Float32Array(vertCount * 3);
  const col = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const nrm: [number, number, number] = [0, 1, 0];
  const put = (v: number, i: number, j: number, drop: number): void => {
    const gi = gi0 + i * step;
    const gj = gj0 + j * step;
    const x = ox + i * step * WORLD.cell;
    const z = oz + j * step * WORLD.cell;
    pos[v * 3] = x;
    pos[v * 3 + 1] = world.gridHeight(gi, gj) - drop;
    pos[v * 3 + 2] = z;
    world.gridNormal(gi, gj, nrm);
    nor[v * 3] = nrm[0];
    nor[v * 3 + 1] = nrm[1];
    nor[v * 3 + 2] = nrm[2];
    const k = (Math.min(gj, WORLD.grid - 1) * WORLD.grid + Math.min(gi, WORLD.grid - 1)) * 3;
    // Stored colours are display-referred; convert to linear for lighting.
    col[v * 3] = Math.pow(world.colors[k]! / 255, 2.2);
    col[v * 3 + 1] = Math.pow(world.colors[k + 1]! / 255, 2.2);
    col[v * 3 + 2] = Math.pow(world.colors[k + 2]! / 255, 2.2);
    uv[v * 2] = x / 7;
    uv[v * 2 + 1] = z / 7;
  };
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) put(j * side + i, i, j, 0);
  const base = side * side;
  for (let i = 0; i < side; i++) {
    put(base + i, i, 0, SKIRT); // north
    put(base + side + i, i, n, SKIRT); // south
    put(base + side * 2 + i, 0, i, SKIRT); // west
    put(base + side * 3 + i, n, i, SKIRT); // east
  }
  const index: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  for (let i = 0; i < n; i++) {
    const tn = i;
    const ts = n * side + i;
    const tw = i * side;
    const te = i * side + n;
    const bn = base + i;
    const bs = base + side + i;
    const bw = base + side * 2 + i;
    const be = base + side * 3 + i;
    index.push(tn, tn + 1, bn, tn + 1, bn + 1, bn);
    index.push(ts + 1, ts, bs, ts + 1, bs, bs + 1);
    index.push(tw + side, tw, bw, tw + side, bw, bw + 1);
    index.push(te, te + side, be, te + side, be + 1, be);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(vertCount > 65535 ? new BufferAttribute(new Uint32Array(index), 1) : new BufferAttribute(new Uint16Array(index), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function Terrain(): React.JSX.Element {
  const group = useRef<Group>(null);
  const lite = useGame((s) => s.settings.quality === 'low');
  const state = useMemo(() => {
    const world = getWorld();
    const material = createTerrainMaterial(lite);
    return { world, material, meshes: new Map<number, Mesh>(), steps: new Map<number, number>(), centre: -1 };
  }, [lite]);

  useEffect(() => {
    const g = group.current;
    return () => {
      for (const m of state.meshes.values()) {
        m.geometry.dispose();
        g?.remove(m);
      }
      state.meshes.clear();
      state.steps.clear();
      state.centre = -1;
      state.material.dispose();
    };
  }, [state]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const pcx = chunkCoord(runtime.player.pos.x);
    const pcz = chunkCoord(runtime.player.pos.z);
    const centre = chunkKey(pcx, pcz);
    if (centre === state.centre) return;
    state.centre = centre;
    // Rebuild at most a ring of chunks per boundary crossing; LOD only changes near the player.
    for (let cz = 0; cz < WORLD.chunksPerSide; cz++) {
      for (let cx = 0; cx < WORLD.chunksPerSide; cx++) {
        const key = chunkKey(cx, cz);
        const step = terrainLodStep(Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)));
        if (state.steps.get(key) === step) continue;
        const geometry = buildChunkGeometry(state.world, cx, cz, step);
        let mesh = state.meshes.get(key);
        if (mesh) {
          mesh.geometry.dispose();
          mesh.geometry = geometry;
        } else {
          mesh = new Mesh(geometry, state.material);
          mesh.receiveShadow = true;
          mesh.name = `terrain-${cx}-${cz}`;
          state.meshes.set(key, mesh);
          g.add(mesh);
        }
        state.steps.set(key, step);
      }
    }
  }, -5);

  return <group ref={group} name="terrain" />;
}
