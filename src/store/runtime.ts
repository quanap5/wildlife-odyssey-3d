/**
 * Mutable per-frame simulation state. It lives outside React/Zustand on purpose:
 * the frame loop writes it 60 times a second, and UI components sample it at a
 * low rate, so gameplay never triggers React re-renders.
 */
import { Vector3 } from 'three';
import { CAMP, PLAYER } from '../config';
import type { BiomeId } from '../data/biomes/biomes';
import type { Behavior } from '../entities/wildlife/types';

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'fog';

export interface TargetInfo {
  id: string;
  kind: 'animal' | 'plant';
  speciesId: string;
  distance: number;
  /** Fraction of sample rays that reach the target, 0..1. */
  visibility: number;
  /** Apparent diameter as a fraction of frame height. */
  frameFraction: number;
  /** Angular offset from the reticle as a fraction of half the vertical FOV. */
  offCenter: number;
  behavior?: Behavior;
  /** Target speed across the frame, in frame-heights per second. */
  screenSpeed: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface CaptureRequest {
  width: number;
  height: number;
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (err: Error) => void;
  /** Debug only: copy the frame exactly as displayed, hand-held items included. Photographs never set this. */
  raw?: boolean;
}

export const runtime = {
  player: {
    pos: new Vector3(CAMP.x + 3, 0, CAMP.z + 5),
    vel: new Vector3(),
    yaw: 2.214,
    pitch: 0,
    grounded: true,
    crouching: false,
    sprinting: false,
    /** Horizontal speed (m/s). */
    speed: 0,
    inWater: false,
    swimming: false,
    biome: 'grassland' as BiomeId,
    distanceWalked: 0,
  },
  camera: {
    pos: new Vector3(),
    dir: new Vector3(0, 0, -1),
    fov: PLAYER.baseFov as number,
    zoom: 1,
    targetZoom: 1,
    /** Exposure compensation in stops. */
    exposure: 0,
    /** Camera rotation speed (rad/s), feeds motion blur scoring. */
    angularSpeed: 0,
    underwater: false,
    /** 0 = first person, 1 = fully third person (eased during the switch). */
    third: 0,
  },
  time: {
    real: 0,
    /** Simulation clock; advances at `scale` x real time. */
    sim: 0,
    scale: 1,
    hour: 7.5,
    /** 0 night .. 1 full daylight. */
    daylight: 1,
    sunDir: new Vector3(0.3, 0.8, 0.5),
  },
  weather: {
    state: 'clear' as WeatherState,
    /** Smoothed 0..1 intensities. */
    rain: 0,
    fog: 0,
    cloud: 0.25,
  },
  target: null as TargetInfo | null,
  /** Autofocus lock 0..1 on the current target. */
  focusLock: 0,
  scan: { targetId: null as string | null, progress: 0 },
  /** How long the current target has been held while it is feeding (s). */
  observe: { targetId: null as string | null, seconds: 0 },
  recording: {
    active: false,
    startedAt: 0,
    /** speciesId -> seconds in the reticle during this recording. */
    species: new Map<string, number>(),
    behaviors: new Map<string, Set<Behavior>>(),
  },
  /** What the researcher is holding. Written by the player controller, read by the view model and the avatar. */
  held: {
    /** Item currently in the hand (it stays here while being lowered). */
    item: null as string | null,
    /** 0 = put away, 1 = fully raised. */
    raise: 0,
    /** A lens tool that has reached the eye: the lens view has taken over and nothing is drawn. */
    atEye: false,
    /** Item briefly shown by an action (map and journal being raised, a specimen being inspected). */
    flash: null as string | null,
    flashUntil: 0,
  },
  /** First-person hand-held pass. `render` is installed by the view model component. */
  viewModel: {
    visible: false,
    render: null as ((gl: unknown) => void) | null,
    /** Number of view-model passes drawn since start. */
    passes: 0,
    /** True if the last capture copied a frame that still had the view model on it (only possible with `raw`). */
    lastCaptureHadViewModel: false,
  },
  capture: null as CaptureRequest | null,
  perf: { fps: 60, frameMs: 16, calls: 0, triangles: 0, renderScale: 1, agents: 0, activeAgents: 0, plants: 0, chunks: 0, width: 0, height: 0, geometries: 0, textures: 0, programs: 0 },
  /** True while pointer lock (or the drag fallback) is steering the camera. */
  lookActive: false,
  /** Set when the simulation should be frozen (menus, journal, inspection). */
  paused: false,
};

export type Runtime = typeof runtime;
