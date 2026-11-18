/** Centralised world and gameplay configuration. All tunables live here. */

export const WORLD = {
  /** World edge length in metres (1 km x 1 km). */
  size: 1024,
  half: 512,
  /** Height-grid cell size in metres. Render mesh, physics and sampling share it. */
  cell: 2,
  /** Grid points per side (size / cell + 1). */
  grid: 513,
  chunkSize: 64,
  chunkCells: 32,
  chunksPerSide: 16,
  waterLevel: 0,
  /** Deterministic seed: the same reserve is generated every session. */
  seed: 20261111,
  /** The player is kept inside +/- playLimit. */
  playLimit: 494,
} as const;

export const CAMP = { x: 0, z: 60 } as const;

export const PLAYER = {
  radius: 0.35,
  height: 1.7,
  eyeHeight: 1.62,
  crouchEyeHeight: 0.95,
  walkSpeed: 4.2,
  sprintSpeed: 7.6,
  crouchSpeed: 1.9,
  swimSpeed: 2.3,
  jumpSpeed: 7.2,
  gravity: 21,
  baseFov: 62,
  interactRange: 3.2,
} as const;

export const ZOOM_PRESETS = [1, 2, 4, 8] as const;
/** Lens apertures (f-numbers) for the camera's depth of field; wider = shallower. */
export const APERTURES = [2.8, 4, 5.6, 8, 11, 16] as const;
/** Composition guides the viewfinder cycles through. */
export const GRID_MODES = ['thirds', 'golden', 'diagonal', 'off'] as const;
export const SLOWMO_PRESETS = [1, 0.5, 0.25] as const;

export const PHOTO = {
  highQuality: 70,
  excellent: 85,
  identifyThreshold: 35,
  resolutions: [
    { id: 'screen', w: 0, h: 0 },
    { id: 'hd', w: 1280, h: 720 },
    { id: 'fhd', w: 1920, h: 1080 },
    { id: 'qhd', w: 2560, h: 1440 },
  ],
} as const;

export const SCAN = { duration: 1.6, range: 45 } as const;

/** Draw-distance presets, in chunk rings around the player. */
export const DRAW_DISTANCE = {
  low: { near: 1, far: 2, wildlife: 110 },
  medium: { near: 2, far: 4, wildlife: 150 },
  high: { near: 2, far: 6, wildlife: 190 },
} as const;

export type QualityLevel = keyof typeof DRAW_DISTANCE;

export const SAVE_VERSION = 2;
export const DB_NAME = 'wildlife-odyssey';
export const SETTINGS_KEY = 'wildlife-odyssey:settings';
