/**
 * Hand-authored macro layout of Emerald Valley Research Reserve.
 * Axes: +x east, +z south, y up. North is -z. Units are metres.
 */
import { CAMP } from '../../config';

export const RIVER_PATH: ReadonlyArray<readonly [number, number]> = [
  [70, -190],
  [96, -120],
  [58, -48],
  [112, 22],
  [172, 92],
  [232, 152],
  [272, 208],
];

export const LAKE = { x: 285, z: 225, rx: 105, rz: 85 } as const;
export const POOL = { x: 70, z: -190, r: 20 } as const;
export const WATERFALL = { x: 70, topZ: -236, bottomZ: -203, width: 9 } as const;
export const RUINS = { x: -320, z: 300, r: 75 } as const;

export interface FlattenSpot {
  x: number;
  z: number;
  r: number;
}

/** Terrain is levelled around these so structures sit on flat ground. */
export const FLATTEN_SPOTS: readonly FlattenSpot[] = [
  { x: CAMP.x, z: CAMP.z, r: 16 },
  { x: -210, z: 30, r: 8 },
  { x: 126, z: 78, r: 8 },
  { x: -70, z: -292, r: 10 },
  { x: RUINS.x, z: RUINS.z, r: 34 },
  { x: -150, z: -262, r: 9 },
];

export interface Landmark {
  id: string;
  kind: 'camp' | 'station' | 'viewpoint' | 'ruins' | 'waterfall' | 'cave' | 'lake';
  x: number;
  z: number;
  /** Radius within which the landmark counts as visited. */
  r: number;
}

export const LANDMARKS: readonly Landmark[] = [
  { id: 'camp', kind: 'camp', x: CAMP.x, z: CAMP.z, r: 20 },
  { id: 'forest-station', kind: 'station', x: -210, z: 30, r: 14 },
  { id: 'river-station', kind: 'station', x: 126, z: 78, r: 14 },
  { id: 'summit-viewpoint', kind: 'viewpoint', x: -70, z: -292, r: 14 },
  { id: 'ruins', kind: 'ruins', x: RUINS.x, z: RUINS.z, r: 40 },
  { id: 'waterfall', kind: 'waterfall', x: 70, z: -196, r: 34 },
  { id: 'rock-shelter', kind: 'cave', x: -150, z: -262, r: 14 },
  { id: 'lake', kind: 'lake', x: 200, z: 196, r: 30 },
];

export interface FeaturePlant {
  speciesId: string;
  x: number;
  z: number;
  scale: number;
  rot: number;
}

/** Hand-placed plants: the sacred figs that have grown over the ruins. */
export const FEATURE_PLANTS: readonly FeaturePlant[] = [
  { speciesId: 'ficus-religiosa', x: -333, z: 312, scale: 1.2, rot: 0.6 },
  { speciesId: 'ficus-religiosa', x: -304, z: 286, scale: 1.05, rot: 2.1 },
  { speciesId: 'ficus-religiosa', x: -341, z: 291, scale: 0.95, rot: 4.0 },
];
