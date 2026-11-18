import type { Vector3 } from 'three';

export type Locomotion = 'walk' | 'run' | 'hop' | 'crawl' | 'fly' | 'swim' | 'soar' | 'wade';

/** Which behaviour controller drives the species. */
export type BehaviorClass = 'walker' | 'bird' | 'soarer' | 'insect' | 'fish';

export const BEHAVIORS = [
  'idle',
  'walking',
  'running',
  'feeding',
  'drinking',
  'resting',
  'searching',
  'fleeing',
  'swimming',
  'flying',
  'alert',
  'returning',
  'perched',
  'hovering',
  'soaring',
  'calling',
] as const;
export type Behavior = (typeof BEHAVIORS)[number];

export type ActivityPattern = 'diurnal' | 'nocturnal' | 'crepuscular';
export type PerchKind = 'tree' | 'shallows' | 'waterside' | 'ground';

export interface SpeciesProfile {
  cls: BehaviorClass;
  locomotion: Locomotion;
  /** Cruising speed (m/s). */
  walkSpeed: number;
  /** Escape speed (m/s). */
  runSpeed: number;
  /** Distance at which the animal notices the player (m). */
  awareness: number;
  /** Distance at which it bolts (m). */
  fleeDistance: number;
  activity: ActivityPattern;
  /** Visits the water's edge to drink. */
  drinks?: boolean;
  perch?: PerchKind;
  /** Typical flight / hover height above ground or water (m). */
  flightHeight?: number;
  /** Preferred depth below the surface as a 0..1 fraction of local water depth. */
  swimDepth?: number;
  /** Seconds between vocalisations [min, max]; omitted = silent. */
  callInterval?: [number, number];
  /** Synth voice used for calls. */
  voice?: 'whistle' | 'chatter' | 'crow' | 'honk' | 'bark' | 'croak' | 'buzz';
}

/** Public shape requested by the design brief. */
export interface WildlifeAgent {
  id: string;
  speciesId: string;
  position: Vector3;
  homeRegion: string;
  currentBehavior: Behavior;
  movementSpeed: number;
  awarenessRadius: number;
  preferredHabitat: string[];
  active: boolean;
}

export interface Perception {
  playerDistance: number;
  /** Player ground speed (m/s). */
  playerSpeed: number;
  playerCrouching: boolean;
  timeInState: number;
  stateDuration: number;
  distanceFromHome: number;
  homeRadius: number;
  /** 0 asleep .. 1 fully active, from time of day and weather. */
  activity: number;
  thirst: number;
  /** Fresh uniform random number for this decision. */
  roll: number;
  raining: boolean;
  foggy: boolean;
  /** The animal has reached its current movement target. */
  atTarget: boolean;
  /** The animal has got used to a quiet, slow observer. */
  habituated: boolean;
  /** Fish only: something is splashing nearby. */
  disturbed: boolean;
}
