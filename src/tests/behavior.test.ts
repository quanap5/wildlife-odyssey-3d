import { describe, expect, it } from 'vitest';
import { activityLevel, awarenessModifier, behaviorDuration, decideBehavior, isFeeding } from '../entities/wildlife/behavior';
import { PROFILES } from '../entities/wildlife/profiles';
import { BEHAVIORS, type Perception } from '../entities/wildlife/types';

const calm: Perception = {
  playerDistance: 200,
  playerSpeed: 0,
  playerCrouching: false,
  timeInState: 0,
  stateDuration: 5,
  distanceFromHome: 5,
  homeRadius: 30,
  activity: 1,
  thirst: 0,
  roll: 0.5,
  raining: false,
  foggy: false,
  atTarget: false,
  habituated: false,
  disturbed: false,
};
const deer = PROFILES['rusa-unicolor']!;
const bulbul = PROFILES['pycnonotus-jocosus']!;
const butterfly = PROFILES['papilio-demoleus']!;
const barb = PROFILES['barbonymus-gonionotus']!;
const eagle = PROFILES['spilornis-cheela']!;

describe('walker state machine (deer)', () => {
  it('keeps grazing while undisturbed and the timer has not run out', () => {
    expect(decideBehavior(deer, 'feeding', { ...calm, timeInState: 2 })).toBe('feeding');
  });

  it('becomes alert when the player enters its awareness radius', () => {
    expect(decideBehavior(deer, 'feeding', { ...calm, playerDistance: deer.awareness - 4, playerSpeed: 2 })).toBe('alert');
  });

  it('flees when the player gets too close, from any calm state', () => {
    for (const b of ['idle', 'walking', 'feeding', 'drinking', 'resting', 'alert'] as const) {
      expect(decideBehavior(deer, b, { ...calm, playerDistance: deer.fleeDistance - 2, playerSpeed: 2 }), b).toBe('fleeing');
    }
  });

  it('keeps fleeing until it has put distance behind it, then looks around', () => {
    expect(decideBehavior(deer, 'fleeing', { ...calm, playerDistance: deer.fleeDistance * 1.5, timeInState: 3 })).toBe('fleeing');
    expect(decideBehavior(deer, 'fleeing', { ...calm, playerDistance: deer.fleeDistance * 3, timeInState: 3 })).toBe('searching');
  });

  it('returns to its home range after searching, then settles', () => {
    expect(decideBehavior(deer, 'searching', { ...calm, timeInState: 9, stateDuration: 4, distanceFromHome: 80 })).toBe('returning');
    expect(decideBehavior(deer, 'searching', { ...calm, timeInState: 9, stateDuration: 4, distanceFromHome: 10 })).toBe('idle');
    expect(decideBehavior(deer, 'returning', { ...calm, distanceFromHome: 40 })).toBe('returning');
    expect(decideBehavior(deer, 'returning', { ...calm, distanceFromHome: 10 })).toBe('idle');
  });

  it('is harder to alarm when the player crouches and easier when sprinting', () => {
    const d = deer.awareness * 0.7;
    expect(decideBehavior(deer, 'feeding', { ...calm, playerDistance: d, playerSpeed: 2 })).toBe('alert');
    expect(decideBehavior(deer, 'feeding', { ...calm, playerDistance: d, playerSpeed: 1.5, playerCrouching: true, timeInState: 1 })).toBe('feeding');
    expect(awarenessModifier({ playerCrouching: false, playerSpeed: 7, foggy: false, raining: false })).toBeGreaterThan(1);
    expect(awarenessModifier({ playerCrouching: true, playerSpeed: 1, foggy: true, raining: false })).toBeLessThan(0.5);
  });

  it('tolerates a quiet observer once habituated', () => {
    expect(decideBehavior(deer, 'feeding', { ...calm, playerDistance: deer.awareness - 4, playerSpeed: 2, habituated: true, timeInState: 1 })).toBe('feeding');
  });

  it('goes to drink when thirsty and rests when inactive', () => {
    expect(decideBehavior(deer, 'idle', { ...calm, timeInState: 9, thirst: 0.9 })).toBe('drinking');
    expect(decideBehavior(deer, 'idle', { ...calm, timeInState: 9, activity: 0.1, roll: 0.3 })).toBe('resting');
    expect(decideBehavior(deer, 'drinking', { ...calm, timeInState: 99, atTarget: false })).toBe('drinking');
  });

  it('picks the next calm behaviour from the roll', () => {
    const next = (roll: number): string => decideBehavior(deer, 'idle', { ...calm, timeInState: 9, roll });
    expect(next(0.1)).toBe('feeding');
    expect(next(0.5)).toBe('walking');
    expect(next(0.8)).toBe('idle');
    expect(next(0.95)).toBe('resting');
  });
});

describe('other behaviour classes', () => {
  it('birds take off when approached and land when they arrive', () => {
    expect(decideBehavior(bulbul, 'perched', { ...calm, playerDistance: bulbul.fleeDistance - 1, playerSpeed: 2 })).toBe('flying');
    expect(decideBehavior(bulbul, 'flying', { ...calm, atTarget: false })).toBe('flying');
    expect(decideBehavior(bulbul, 'flying', { ...calm, atTarget: true })).toBe('perched');
    expect(decideBehavior(bulbul, 'perched', { ...calm, timeInState: 9, roll: 0.35 })).toBe('calling');
  });

  it('insects shelter from rain and at night, and settle on flowers', () => {
    expect(decideBehavior(butterfly, 'flying', { ...calm, raining: true })).toBe('resting');
    expect(decideBehavior(butterfly, 'feeding', { ...calm, activity: 0.05 })).toBe('resting');
    expect(decideBehavior(butterfly, 'flying', { ...calm, atTarget: true, roll: 0.2 })).toBe('feeding');
    expect(decideBehavior(butterfly, 'feeding', { ...calm, playerDistance: 1, playerSpeed: 3 })).toBe('flying');
  });

  it('fish bolt when disturbed and calm down afterwards', () => {
    expect(decideBehavior(barb, 'swimming', { ...calm, disturbed: true })).toBe('fleeing');
    expect(decideBehavior(barb, 'fleeing', { ...calm, timeInState: 1 })).toBe('fleeing');
    expect(decideBehavior(barb, 'fleeing', { ...calm, timeInState: 3 })).toBe('swimming');
  });

  it('eagles soar by day and rest in rain or at night', () => {
    expect(decideBehavior(eagle, 'resting', { ...calm, timeInState: 10 })).toBe('soaring');
    expect(decideBehavior(eagle, 'soaring', { ...calm, raining: true })).toBe('resting');
    expect(decideBehavior(eagle, 'soaring', { ...calm, activity: 0.1 })).toBe('resting');
  });

  it('only ever returns known behaviours', () => {
    for (const profile of Object.values(PROFILES)) {
      for (const b of BEHAVIORS) {
        for (const roll of [0, 0.3, 0.6, 0.99]) {
          const next = decideBehavior(profile, b, { ...calm, timeInState: 99, roll, playerDistance: 3, playerSpeed: 4 });
          expect(BEHAVIORS).toContain(next);
        }
      }
    }
  });
});

describe('daily rhythm', () => {
  it('diurnal animals are active at noon and asleep at midnight', () => {
    expect(activityLevel('diurnal', 12)).toBeGreaterThan(0.9);
    expect(activityLevel('diurnal', 0)).toBeLessThan(0.2);
  });

  it('nocturnal animals are the reverse', () => {
    expect(activityLevel('nocturnal', 0)).toBeGreaterThan(0.9);
    expect(activityLevel('nocturnal', 12)).toBeLessThan(0.4);
  });

  it('crepuscular animals peak at dawn and dusk', () => {
    expect(activityLevel('crepuscular', 6.3)).toBeGreaterThan(activityLevel('crepuscular', 12));
    expect(activityLevel('crepuscular', 18)).toBeGreaterThan(activityLevel('crepuscular', 13));
  });

  it('gives sensible durations and classifies feeding', () => {
    for (const b of BEHAVIORS) expect(behaviorDuration(b, 0.5)).toBeGreaterThan(0);
    expect(isFeeding('feeding')).toBe(true);
    expect(isFeeding('drinking')).toBe(true);
    expect(isFeeding('walking')).toBe(false);
  });
});
