/**
 * Pure behaviour logic: a small finite state machine per behaviour class.
 * No rendering, no world access - everything it needs arrives in `Perception`,
 * which makes every transition unit-testable.
 */
import { clamp01, smoothstep } from '../../utils/math';
import type { ActivityPattern, Behavior, Perception, SpeciesProfile } from './types';

/** How strongly the player is noticed: crouching hides you, sprinting and clear air give you away. */
export function awarenessModifier(p: Pick<Perception, 'playerCrouching' | 'playerSpeed' | 'foggy' | 'raining'>): number {
  let m = 1;
  if (p.playerCrouching) m *= 0.5;
  if (p.playerSpeed > 6) m *= 1.45;
  else if (p.playerSpeed < 0.3) m *= 0.8;
  if (p.foggy) m *= 0.65;
  if (p.raining) m *= 0.85;
  return m;
}

/** Activity 0..1 for a daily rhythm at a given hour (0-24). */
export function activityLevel(pattern: ActivityPattern, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const day = smoothstep(5, 7, h) * (1 - smoothstep(17.5, 19.5, h));
  const dawn = Math.exp(-(((h - 6.3) / 1.4) ** 2));
  const dusk = Math.exp(-(((h - 18) / 1.5) ** 2));
  switch (pattern) {
    case 'diurnal':
      return clamp01(0.08 + 0.92 * day);
    case 'nocturnal':
      return clamp01(0.3 + 0.7 * (1 - day));
    case 'crepuscular':
      // Peaks at dawn and dusk but stays moderately active otherwise.
      return clamp01(0.42 + 0.58 * Math.max(dawn, dusk) + 0.1 * (1 - day));
  }
}

const CALM: ReadonlySet<Behavior> = new Set(['idle', 'walking', 'feeding', 'drinking', 'resting', 'perched', 'calling', 'hovering', 'swimming']);

function walker(profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  const mod = awarenessModifier(p);
  const flee = profile.fleeDistance * mod;
  const aware = profile.awareness * mod;
  if (current === 'fleeing' || current === 'running') {
    if (p.playerDistance > flee * 2.4 && p.timeInState > 1.5) return 'searching';
    return 'fleeing';
  }
  if (p.playerDistance < flee) return 'fleeing';
  if (current === 'searching') {
    if (p.timeInState < p.stateDuration) return 'searching';
    return p.distanceFromHome > p.homeRadius ? 'returning' : 'idle';
  }
  if (current === 'returning') {
    return p.distanceFromHome < p.homeRadius * 0.5 ? 'idle' : 'returning';
  }
  if (p.playerDistance < aware && !p.habituated) return 'alert';
  if (current === 'alert') return p.timeInState > 1.2 ? 'idle' : 'alert';
  if (p.distanceFromHome > p.homeRadius * 1.3) return 'returning';
  if (current === 'drinking' && !p.atTarget) return 'drinking';
  if (p.timeInState < p.stateDuration) return current;
  if (p.activity < 0.25) return p.roll < 0.8 ? 'resting' : 'idle';
  if (profile.drinks && p.thirst > 0.7) return 'drinking';
  if (p.roll < 0.38) return 'feeding';
  if (p.roll < 0.72) return 'walking';
  if (p.roll < 0.9) return 'idle';
  return 'resting';
}

function bird(profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  const mod = awarenessModifier(p);
  if (current === 'flying') return p.atTarget ? 'perched' : 'flying';
  if (p.playerDistance < profile.fleeDistance * mod) return 'flying';
  if (p.playerDistance < profile.awareness * mod && !p.habituated) return 'alert';
  if (current === 'alert') return p.timeInState > 1 ? 'perched' : 'alert';
  if (p.timeInState < p.stateDuration) return current;
  if (p.activity < 0.25) return 'resting';
  const fly = p.raining ? 0.12 : 0.3;
  if (p.roll < fly) return 'flying';
  if (p.roll < fly + 0.2) return profile.callInterval ? 'calling' : 'perched';
  if (p.roll < fly + 0.5) return 'feeding';
  return 'perched';
}

function soarer(_profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  if (p.activity < 0.25 || p.raining) return 'resting';
  if (current === 'resting' && p.timeInState < 4) return 'resting';
  return 'soaring';
}

function insect(profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  if (p.raining || p.activity < 0.2) return 'resting';
  const startled = p.playerDistance < profile.fleeDistance && p.playerSpeed > 1.5;
  if (current === 'flying') {
    if (!p.atTarget) return 'flying';
    return p.roll < 0.7 ? 'feeding' : 'hovering';
  }
  if (startled) return 'flying';
  if (p.timeInState < p.stateDuration) return current;
  return 'flying';
}

function fish(_profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  if (p.disturbed) return 'fleeing';
  if (current === 'fleeing') return p.timeInState > 2.5 ? 'swimming' : 'fleeing';
  if (p.timeInState < p.stateDuration) return current;
  if (p.activity < 0.25) return p.roll < 0.7 ? 'resting' : 'swimming';
  if (p.roll < 0.28) return 'feeding';
  if (p.roll < 0.38) return 'resting';
  return 'swimming';
}

/** The state machine entry point. Returns the behaviour for the next tick. */
export function decideBehavior(profile: SpeciesProfile, current: Behavior, p: Perception): Behavior {
  switch (profile.cls) {
    case 'walker':
      return walker(profile, current, p);
    case 'bird':
      return bird(profile, current, p);
    case 'soarer':
      return soarer(profile, current, p);
    case 'insect':
      return insect(profile, current, p);
    case 'fish':
      return fish(profile, current, p);
  }
}

/** How long a freshly entered behaviour lasts before the animal reconsiders (s). */
export function behaviorDuration(b: Behavior, roll: number): number {
  switch (b) {
    case 'feeding':
      return 6 + roll * 9;
    case 'walking':
    case 'swimming':
      return 5 + roll * 8;
    case 'idle':
    case 'perched':
      return 3 + roll * 5;
    case 'resting':
      return 10 + roll * 14;
    case 'drinking':
      return 6 + roll * 4;
    case 'searching':
      return 3 + roll * 3;
    case 'calling':
      return 2 + roll * 1.5;
    case 'hovering':
      return 1.5 + roll * 2.5;
    case 'alert':
      return 2;
    default:
      return 4 + roll * 4;
  }
}

export const isCalm = (b: Behavior): boolean => CALM.has(b);

/** Behaviours that count as a "feeding observation" for research objectives. */
export const isFeeding = (b: Behavior): boolean => b === 'feeding' || b === 'drinking';
