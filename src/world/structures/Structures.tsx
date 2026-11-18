/**
 * Renders the camp, stations, viewpoint, rock shelter, ruins, artifacts, notes
 * and animal tracks. Everything static is baked into a single vertex-coloured
 * mesh (one draw call); only the campfire flame and the waypoint beacon move.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Vector2,
  type Vector3,
} from 'three';
import { CAMP } from '../../config';
import { GeoBuilder, blob, limb, sphere, type ColorFn } from '../../engine/rendering/geoBuilder';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { hash2 } from '../../utils/rng';
import { getWorld } from '../terrain/heightmap';
import { BOXES, COLUMNS, INTERACTABLES, SHELTER, STATIONS, TENTS } from './structures';

const MOSS = new Color('#55733a');

/** Stone / wood colour with grain, and moss creeping over upward faces of stonework. */
function weathered(hex: string, mossy: boolean): ColorFn {
  const base = new Color(hex);
  const out = new Color();
  return (p: Vector3, n: Vector3) => {
    const k = hash2(Math.round(p.x * 3.1), Math.round(p.z * 3.1) + Math.round(p.y * 2.3) * 7);
    out.copy(base).offsetHSL(0, 0, (k - 0.5) * 0.09);
    if (mossy && n.y > 0.4 && k > 0.35) out.lerp(MOSS, (k - 0.35) * 1.1);
    if (mossy && n.y <= 0.4 && k > 0.8) out.lerp(MOSS, 0.5);
    return out;
  };
}

function prism(hw: number, h: number, hl: number): BufferGeometry {
  const a = [-hw, 0, -hl];
  const b = [hw, 0, -hl];
  const c = [0, h, -hl];
  const d = [-hw, 0, hl];
  const e = [hw, 0, hl];
  const f = [0, h, hl];
  const tris = [a, c, b, d, e, f, a, d, f, a, f, c, b, c, f, b, f, e].flat();
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(tris), 3));
  g.computeVertexNormals();
  return g;
}

function buildStatic(): BufferGeometry {
  const world = getWorld();
  const g = new GeoBuilder();
  const ground = (x: number, z: number): number => world.heightAt(x, z);

  for (const b of BOXES) {
    const stone = b.color.startsWith('#8a87') || b.color.startsWith('#6f6d') || b.color.startsWith('#9a96');
    g.add(new BoxGeometry(b.w, b.h, b.d), { pos: [b.x, ground(b.x, b.z) + b.base + b.h / 2, b.z], rot: [0, b.rotY, b.tilt ?? 0], color: weathered(b.color, stone) });
  }
  for (const c of COLUMNS) {
    const y = ground(c.x, c.z) + c.base;
    const stone = c.r > 0.2;
    g.add(new CylinderGeometry(c.r * 0.9, c.r, c.h, 10), { pos: [c.x, y + c.h / 2, c.z], color: weathered(c.color, stone) });
    if (stone) {
      g.add(new BoxGeometry(c.r * 2.5, 0.3, c.r * 2.5), { pos: [c.x, y + 0.15, c.z], color: weathered(c.color, true) });
      if (!c.broken) g.add(new BoxGeometry(c.r * 2.4, 0.32, c.r * 2.4), { pos: [c.x, y + c.h - 0.16, c.z], color: weathered(c.color, true) });
    } else {
      // Flag on the camp pole.
      g.add(new BoxGeometry(1.1, 0.65, 0.02), { pos: [c.x + 0.6, y + c.h - 0.45, c.z], color: '#2f7d4f' });
    }
  }
  for (const t of TENTS) {
    const y = ground(t.x, t.z);
    g.add(prism(1.7, 2.0, 1.25), { pos: [t.x, y, t.z], rot: [0, t.rotY, 0], color: weathered(t.color, false) });
    g.add(new BoxGeometry(0.9, 1.3, 0.04), { pos: [t.x + Math.sin(t.rotY) * 1.27, y + 0.65, t.z + Math.cos(t.rotY) * 1.27], rot: [0, t.rotY, 0], color: '#2a2a26' });
  }
  for (const s of STATIONS) {
    const y = ground(s.x, s.z);
    g.add(new BoxGeometry(3.4, 0.32, 3.4), { pos: [s.x, y + 0.16, s.z], rot: [0, s.rotY, 0], color: weathered('#7a5a3a', false) });
    const cs = Math.cos(s.rotY);
    const sn = Math.sin(s.rotY);
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) {
      g.add(new CylinderGeometry(0.1, 0.1, 3, 6), { pos: [s.x + dx * cs + dz * sn, y + 1.5, s.z - dx * sn + dz * cs], color: '#5b3f28' });
    }
    g.add(new ConeGeometry(2.9, 1.3, 4), { pos: [s.x, y + 3.65, s.z], rot: [0, s.rotY + Math.PI / 4, 0], color: weathered('#4f6b4a', false) });
    // Field desk with instruments.
    g.add(new BoxGeometry(1.2, 0.06, 0.6), { pos: [s.x + 0.6 * cs, y + 1.05, s.z - 0.6 * sn], rot: [0, s.rotY, 0], color: '#8a6a45' });
    g.add(new BoxGeometry(0.3, 0.22, 0.2), { pos: [s.x + 0.6 * cs, y + 1.2, s.z - 0.6 * sn], rot: [0, s.rotY, 0], color: '#2e3a40' });
  }

  for (const it of INTERACTABLES) {
    const y = ground(it.x, it.z);
    if (it.kind === 'sign') {
      for (const dx of [-0.6, 0.6]) g.add(new CylinderGeometry(0.045, 0.045, it.lift + 0.5, 6), { pos: [it.x + dx, y + (it.lift + 0.5) / 2, it.z], color: '#5b3f28' });
      if (it.id !== 'camp-board') g.add(new BoxGeometry(1.4, 0.8, 0.06), { pos: [it.x, y + it.lift, it.z], color: '#d8cfae' });
      // Lines of "text".
      for (let i = 0; i < 4; i++) g.add(new BoxGeometry(1.0 - i * 0.12, 0.05, 0.02), { pos: [it.x - i * 0.06, y + it.lift + 0.24 - i * 0.14, it.z + 0.05], color: '#3a332a' });
    } else if (it.kind === 'note') {
      g.add(limb(0.02, 0.015, 0.7, 5), { pos: [it.x, y, it.z], color: '#5b3f28' });
      g.add(new BoxGeometry(0.26, 0.18, 0.02), { pos: [it.x, y + 0.56, it.z + 0.02], rot: [-0.25, 0.4, 0], color: '#f3ecd2' });
      g.add(new BoxGeometry(0.18, 0.12, 0.01), { pos: [it.x + 0.09, y + 0.74, it.z], rot: [0, 0.4, 0], color: '#e8842a' });
    } else if (it.kind === 'artifact') {
      const base = y + 0.3;
      if (it.id === 'jar') {
        const profile = [0.08, 0.16, 0.24, 0.27, 0.24, 0.17, 0.11, 0.13].map((r, i) => new Vector2(r, i * 0.07));
        g.add(new LatheGeometry(profile, 12), { pos: [it.x, base, it.z], color: weathered('#a8643c', false) });
      } else if (it.id === 'bell') {
        const profile = [0.17, 0.165, 0.14, 0.11, 0.07, 0.02].map((r, i) => new Vector2(r, i * 0.06));
        g.add(new LatheGeometry(profile, 12), { pos: [it.x, base + 0.02, it.z], rot: [0.5, 0.3, 0.9], color: weathered('#5f8f76', false) });
      } else {
        g.add(new BoxGeometry(0.5, 0.7, 0.09), { pos: [it.x, base + 0.33, it.z], rot: [-0.25, 0.3, 0], color: weathered('#a29d90', true) });
        for (let i = 0; i < 4; i++) g.add(new BoxGeometry(0.34, 0.03, 0.02), { pos: [it.x, base + 0.5 - i * 0.11, it.z + 0.05 + i * 0.027], rot: [-0.25, 0.3, 0], color: '#5a564d' });
      }
    } else if (it.kind === 'tracks' && it.toward) {
      const dx = it.toward[0] - it.x;
      const dz = it.toward[1] - it.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const yaw = Math.atan2(ux, uz);
      for (let i = 0; i < 16; i++) {
        const side = i % 2 === 0 ? 0.13 : -0.13;
        const px = it.x + ux * i * 0.85 - uz * side;
        const pz = it.z + uz * i * 0.85 + ux * side;
        for (const toe of [-0.035, 0.035]) {
          g.add(sphere(1, 6, 4), { pos: [px - uz * toe, ground(px, pz) + 0.012, pz + ux * toe], rot: [0, yaw, 0], scale: [0.03, 0.006, 0.075], color: '#231b13' });
        }
      }
    }
  }

  // Rock shelter: boulders leaning together under a capstone.
  const sy = ground(SHELTER.x, SHELTER.z);
  const rockColor = weathered('#77746c', true);
  g.add(blob(1, 2, 301, 0.22), { pos: [SHELTER.x - 4.2, sy + 2.0, SHELTER.z - 1.5], scale: [2.7, 3.3, 2.9], color: rockColor });
  g.add(blob(1, 2, 302, 0.22), { pos: [SHELTER.x + 4.2, sy + 2.0, SHELTER.z - 1.5], scale: [2.7, 3.1, 2.9], color: rockColor });
  g.add(blob(1, 2, 303, 0.22), { pos: [SHELTER.x, sy + 2.2, SHELTER.z - 5.2], scale: [3.4, 3.4, 3.0], color: rockColor });
  g.add(blob(1, 2, 304, 0.18), { pos: [SHELTER.x, sy + 5.0, SHELTER.z - 2.2], scale: [6.2, 1.3, 4.4], color: rockColor });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(blob(0.16, 0, 310 + i, 0.3), { pos: [SHELTER.x + Math.cos(a) * 0.6, sy + 0.08, SHELTER.z - 1 + Math.sin(a) * 0.6], color: '#4a4741' });
  }

  // Campfire ring and logs.
  const fy = ground(CAMP.x, CAMP.z - 1);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(blob(0.17, 0, 320 + i, 0.3), { pos: [CAMP.x + Math.cos(a) * 0.62, fy + 0.08, CAMP.z - 1 + Math.sin(a) * 0.62], color: '#6b6861' });
  }
  for (let i = 0; i < 3; i++) g.add(limb(0.07, 0.06, 0.8, 6), { pos: [CAMP.x, fy + 0.08, CAMP.z - 1], rot: [1.25, (i / 3) * Math.PI * 2, 0], color: '#3a2a1c' });
  // Lantern post beside the table.
  g.add(new CylinderGeometry(0.04, 0.04, 2.1, 6), { pos: [CAMP.x - 4.4, ground(CAMP.x - 4.4, CAMP.z + 3) + 1.05, CAMP.z + 3], color: '#4b3523' });

  return g.build();
}

export function Structures(): React.JSX.Element {
  const flame = useRef<Mesh>(null);
  const fire = useRef<PointLight>(null);
  const lantern = useRef<Mesh>(null);
  const res = useMemo(() => {
    const world = getWorld();
    return {
      geometry: buildStatic(),
      material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide }),
      flameGeo: new ConeGeometry(0.22, 0.7, 7),
      flameMat: new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }),
      lanternGeo: new BoxGeometry(0.16, 0.22, 0.16),
      lanternMat: new MeshBasicMaterial({ color: '#ffd98a' }),
      fireY: world.heightAt(CAMP.x, CAMP.z - 1),
      lanternY: world.heightAt(CAMP.x - 4.4, CAMP.z + 3) + 2.15,
    };
  }, []);

  useEffect(
    () => () => {
      res.geometry.dispose();
      res.material.dispose();
      res.flameGeo.dispose();
      res.flameMat.dispose();
      res.lanternGeo.dispose();
      res.lanternMat.dispose();
    },
    [res],
  );

  useFrame(() => {
    const t = runtime.time.sim;
    const night = 1 - runtime.time.daylight;
    const flicker = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.07;
    if (flame.current) {
      flame.current.scale.set(flicker, 0.8 + flicker * 0.5, flicker);
      flame.current.rotation.y = t * 2;
    }
    if (fire.current) fire.current.intensity = (6 + night * 30) * flicker;
    res.lanternMat.color.setScalar(0.35 + night * 0.9);
  });

  return (
    <group name="structures">
      <mesh geometry={res.geometry} material={res.material} castShadow receiveShadow />
      <mesh ref={flame} geometry={res.flameGeo} material={res.flameMat} position={[CAMP.x, res.fireY + 0.45, CAMP.z - 1]} />
      <pointLight ref={fire} color="#ff9a4a" distance={16} decay={2} position={[CAMP.x, res.fireY + 0.8, CAMP.z - 1]} />
      <mesh ref={lantern} geometry={res.lanternGeo} material={res.lanternMat} position={[CAMP.x - 4.4, res.lanternY, CAMP.z + 3]} />
    </group>
  );
}

/** Light pillar marking the player's map waypoint in the world. */
export function WaypointBeacon(): React.JSX.Element | null {
  const waypoint = useGame((s) => s.waypoint);
  const res = useMemo(
    () => ({
      geo: new CylinderGeometry(0.5, 0.5, 90, 10, 1, true),
      mat: new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      res.geo.dispose();
      res.mat.dispose();
    },
    [res],
  );
  if (!waypoint) return null;
  const y = Math.max(getWorld().heightAt(waypoint[0], waypoint[1]), 0);
  return <mesh geometry={res.geo} material={res.mat} position={[waypoint[0], y + 45, waypoint[1]]} />;
}
