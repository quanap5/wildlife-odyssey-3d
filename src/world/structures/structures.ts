/**
 * Built structures and interactive props: research camp, stations, viewpoint,
 * rock shelter and the ruins. Pure data shared by rendering, physics (colliders),
 * targeting (sight blockers) and the interaction system.
 */
import { CAMP } from '../../config';
import type { TextKey } from '../../i18n/en';
import { RUINS } from '../terrain/layout';

export type StaticCollider =
  | { kind: 'box'; x: number; z: number; /** Base height above the terrain. */ base: number; hx: number; hy: number; hz: number; rotY: number }
  | { kind: 'cyl'; x: number; z: number; base: number; r: number; h: number };

export type InteractableKind = 'sign' | 'note' | 'artifact' | 'tracks' | 'stele' | 'shelter';

export interface Interactable {
  id: string;
  kind: InteractableKind;
  x: number;
  z: number;
  /** Height of the interaction point above the terrain. */
  lift: number;
  radius: number;
  name: TextKey;
  title: TextKey;
  body: TextKey;
  /** Landmark recorded when used. */
  landmark?: string;
  /** Reveals every landmark on the map when used (viewpoint). */
  panorama?: boolean;
  /** Tracks: the species that made them and where they lead. */
  speciesId?: string;
  toward?: [number, number];
}

export interface PropBox {
  x: number;
  z: number;
  base: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
  color: string;
  collide?: boolean;
  /** Tilt for fallen blocks (rad about z). */
  tilt?: number;
}

export interface PropColumn {
  x: number;
  z: number;
  base: number;
  r: number;
  h: number;
  color: string;
  broken?: boolean;
}

export interface Tent {
  x: number;
  z: number;
  rotY: number;
  color: string;
}

export interface Station {
  id: string;
  x: number;
  z: number;
  rotY: number;
}

const R = RUINS;
const STONE = '#8a8778';
const STONE_DARK = '#6f6d60';
const WOOD = '#6b4a2f';

export const TENTS: readonly Tent[] = [
  { x: CAMP.x - 6, z: CAMP.z - 3.5, rotY: 0.45, color: '#b7693a' },
  { x: CAMP.x + 6.5, z: CAMP.z - 4.5, rotY: -0.55, color: '#4f7d5a' },
];

export const STATIONS: readonly Station[] = [
  { id: 'forest-station', x: -210, z: 30, rotY: 0.6 },
  { id: 'river-station', x: 126, z: 78, rotY: -0.9 },
];

export const BOXES: readonly PropBox[] = [
  // Camp: work table, crates, notice board.
  { x: CAMP.x - 2.8, z: CAMP.z + 2.5, base: 0.72, w: 1.9, h: 0.08, d: 0.9, rotY: 0.2, color: WOOD },
  { x: CAMP.x - 2.8, z: CAMP.z + 2.5, base: 0, w: 1.7, h: 0.72, d: 0.7, rotY: 0.2, color: '#4b3523', collide: true },
  { x: CAMP.x + 3.6, z: CAMP.z + 1.2, base: 0, w: 0.8, h: 0.6, d: 0.6, rotY: 0.5, color: '#7a6a45', collide: true },
  { x: CAMP.x + 4.3, z: CAMP.z + 1.9, base: 0, w: 0.6, h: 0.45, d: 0.6, rotY: -0.2, color: '#5f6f4a', collide: true },
  { x: CAMP.x + 9.5, z: CAMP.z + 1.5, base: 1.0, w: 1.6, h: 1.0, d: 0.08, rotY: 0, color: '#d8cfae' },
  // Viewpoint: railing and bench.
  { x: -70, z: -287.2, base: 0.95, w: 9, h: 0.09, d: 0.14, rotY: 0, color: WOOD, collide: true },
  { x: -70, z: -287.2, base: 0.5, w: 9, h: 0.07, d: 0.07, rotY: 0, color: WOOD },
  { x: -74.4, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -73.3, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -72.2, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -71.1, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -70.0, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -68.9, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -67.8, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -66.7, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -65.6, z: -287.2, base: 0, w: 0.12, h: 0.98, d: 0.12, rotY: 0, color: '#6b4a2e' },
  { x: -72.5, z: -294, base: 0.42, w: 1.8, h: 0.08, d: 0.45, rotY: 0.2, color: WOOD, collide: true },
  // Ruins: platform, walls, fallen blocks, stele.
  { x: R.x, z: R.z, base: 0, w: 18, h: 0.3, d: 14, rotY: 0, color: STONE },
  { x: R.x, z: R.z - 6.6, base: 0.3, w: 12, h: 2.6, d: 0.7, rotY: 0, color: STONE_DARK, collide: true },
  { x: R.x - 8.6, z: R.z - 2.4, base: 0.3, w: 0.7, h: 1.9, d: 7, rotY: 0, color: STONE_DARK, collide: true },
  { x: R.x + 8.6, z: R.z - 4, base: 0.3, w: 0.7, h: 1.2, d: 4.5, rotY: 0, color: STONE, collide: true },
  { x: R.x + 6.2, z: R.z + 4.6, base: 0.3, w: 1.6, h: 0.7, d: 0.8, rotY: 0.5, color: STONE, collide: true, tilt: 0.18 },
  { x: R.x - 4.4, z: R.z + 5.6, base: 0.3, w: 1.3, h: 0.6, d: 0.7, rotY: -0.7, color: STONE_DARK, collide: true, tilt: -0.12 },
  { x: R.x + 11.5, z: R.z + 2, base: 0, w: 1.5, h: 0.7, d: 0.9, rotY: 1.1, color: STONE, collide: true, tilt: 0.3 },
  { x: R.x, z: R.z - 4.6, base: 0.3, w: 1.0, h: 1.8, d: 0.3, rotY: 0, color: '#9a968a', collide: true },
  // Stairs up to the platform (two shallow steps).
  { x: R.x, z: R.z + 7.5, base: 0, w: 4, h: 0.15, d: 1, rotY: 0, color: STONE },
  // Archway lintel across the two front columns.
  { x: R.x, z: R.z + 5.2, base: 3.9, w: 5.4, h: 0.5, d: 0.8, rotY: 0, color: STONE_DARK },
];

export const COLUMNS: readonly PropColumn[] = [
  { x: R.x - 2.4, z: R.z + 5.2, base: 0.3, r: 0.42, h: 3.6, color: STONE },
  { x: R.x + 2.4, z: R.z + 5.2, base: 0.3, r: 0.42, h: 3.6, color: STONE },
  { x: R.x - 7, z: R.z + 5.2, base: 0.3, r: 0.42, h: 2.2, color: STONE_DARK, broken: true },
  { x: R.x + 7, z: R.z + 5.2, base: 0.3, r: 0.42, h: 1.3, color: STONE, broken: true },
  { x: R.x - 7, z: R.z, base: 0.3, r: 0.42, h: 3.2, color: STONE },
  { x: R.x + 7, z: R.z, base: 0.3, r: 0.42, h: 0.9, color: STONE_DARK, broken: true },
  // Flag pole at camp.
  { x: CAMP.x - 9, z: CAMP.z - 7, base: 0, r: 0.05, h: 5.5, color: '#c9c4b4' },
];

/** Large boulders forming the rock shelter. */
export const SHELTER = { x: -150, z: -262 } as const;

function stationColliders(s: Station): StaticCollider[] {
  const out: StaticCollider[] = [];
  const c = Math.cos(s.rotY);
  const sn = Math.sin(s.rotY);
  for (const [dx, dz] of [
    [-1.5, -1.5],
    [1.5, -1.5],
    [-1.5, 1.5],
    [1.5, 1.5],
  ] as const) {
    out.push({ kind: 'cyl', x: s.x + dx * c + dz * sn, z: s.z - dx * sn + dz * c, base: 0, r: 0.14, h: 3 });
  }
  out.push({ kind: 'box', x: s.x, z: s.z, base: 0, hx: 1.7, hy: 0.16, hz: 1.7, rotY: s.rotY });
  return out;
}

export const STATIC_COLLIDERS: readonly StaticCollider[] = [
  ...TENTS.map((t): StaticCollider => ({ kind: 'box', x: t.x, z: t.z, base: 0, hx: 1.7, hy: 1.0, hz: 1.25, rotY: t.rotY })),
  ...BOXES.filter((b) => b.collide || b.h <= 0.3).map((b): StaticCollider => ({ kind: 'box', x: b.x, z: b.z, base: b.base, hx: b.w / 2, hy: b.h / 2, hz: b.d / 2, rotY: b.rotY })),
  ...COLUMNS.map((c): StaticCollider => ({ kind: 'cyl', x: c.x, z: c.z, base: c.base, r: c.r, h: c.h })),
  ...STATIONS.flatMap(stationColliders),
  // Rock shelter boulders (approximated by cylinders).
  { kind: 'cyl', x: SHELTER.x - 4.2, z: SHELTER.z - 1.5, base: 0, r: 2.6, h: 5 },
  { kind: 'cyl', x: SHELTER.x + 4.2, z: SHELTER.z - 1.5, base: 0, r: 2.6, h: 5 },
  { kind: 'cyl', x: SHELTER.x, z: SHELTER.z - 5.2, base: 0, r: 3.2, h: 5 },
];

export const INTERACTABLES: readonly Interactable[] = [
  { id: 'camp-board', kind: 'sign', x: CAMP.x + 9.5, z: CAMP.z + 1.5, lift: 1.5, radius: 2.4, name: 'landmark.camp', title: 'read.camp.title', body: 'read.camp.body', landmark: 'camp' },
  { id: 'forest-station-sign', kind: 'sign', x: -207.6, z: 32.6, lift: 1.3, radius: 2.6, name: 'landmark.forest-station', title: 'read.forest-station.title', body: 'read.forest-station.body', landmark: 'forest-station' },
  { id: 'river-station-sign', kind: 'sign', x: 123.4, z: 80.4, lift: 1.3, radius: 2.6, name: 'landmark.river-station', title: 'read.river-station.title', body: 'read.river-station.body', landmark: 'river-station' },
  { id: 'viewpoint-sign', kind: 'sign', x: -66, z: -290, lift: 1.3, radius: 2.6, name: 'landmark.summit-viewpoint', title: 'read.summit-viewpoint.title', body: 'read.summit-viewpoint.body', landmark: 'summit-viewpoint', panorama: true },
  { id: 'stele', kind: 'stele', x: R.x, z: R.z - 4.2, lift: 1.2, radius: 2.6, name: 'read.stele.title', title: 'read.stele.title', body: 'read.stele.body', landmark: 'ruins' },
  { id: 'shelter', kind: 'shelter', x: SHELTER.x, z: SHELTER.z - 1.2, lift: 1, radius: 3, name: 'landmark.rock-shelter', title: 'read.shelter.title', body: 'read.shelter.body', landmark: 'rock-shelter' },
  { id: 'jar', kind: 'artifact', x: R.x + 4.2, z: R.z - 3.4, lift: 0.6, radius: 2, name: 'artifact.jar', title: 'artifact.jar', body: 'artifact.jarBody' },
  { id: 'bell', kind: 'artifact', x: R.x - 5.2, z: R.z + 2.2, lift: 0.5, radius: 2, name: 'artifact.bell', title: 'artifact.bell', body: 'artifact.bellBody' },
  { id: 'tablet', kind: 'artifact', x: R.x - 2.6, z: R.z - 5.4, lift: 0.7, radius: 2, name: 'artifact.tablet', title: 'artifact.tablet', body: 'artifact.tabletBody' },
  { id: 'note1', kind: 'note', x: 84, z: -30, lift: 0.5, radius: 2.2, name: 'read.note1.title', title: 'read.note1.title', body: 'read.note1.body' },
  { id: 'note2', kind: 'note', x: -336, z: 316, lift: 0.5, radius: 2.2, name: 'read.note2.title', title: 'read.note2.title', body: 'read.note2.body' },
  { id: 'note3', kind: 'note', x: 62, z: 152, lift: 0.5, radius: 2.2, name: 'read.note3.title', title: 'read.note3.title', body: 'read.note3.body' },
  { id: 'note4', kind: 'note', x: 46, z: -199, lift: 0.5, radius: 2.2, name: 'read.note4.title', title: 'read.note4.title', body: 'read.note4.body' },
  { id: 'tracks-sambar', kind: 'tracks', x: -16, z: 80, lift: 0.2, radius: 2.4, name: 'prompt.tracks', title: 'prompt.tracks', body: 'prompt.tracks', speciesId: 'rusa-unicolor', toward: [-52, 104] },
  { id: 'tracks-sambar-2', kind: 'tracks', x: 22, z: -52, lift: 0.2, radius: 2.4, name: 'prompt.tracks', title: 'prompt.tracks', body: 'prompt.tracks', speciesId: 'rusa-unicolor', toward: [-8, -84] },
  { id: 'tracks-boar', kind: 'tracks', x: -150, z: -28, lift: 0.2, radius: 2.4, name: 'prompt.tracks', title: 'prompt.tracks', body: 'prompt.tracks', speciesId: 'sus-scrofa', toward: [-190, -60] },
  { id: 'tracks-muntjac', kind: 'tracks', x: -198, z: 86, lift: 0.2, radius: 2.4, name: 'prompt.tracks', title: 'prompt.tracks', body: 'prompt.tracks', speciesId: 'muntiacus-vaginalis', toward: [-230, 120] },
];

export const getInteractable = (id: string): Interactable | undefined => INTERACTABLES.find((i) => i.id === id);
