import { describe, expect, it } from 'vitest';
import { animateRig, type AnimState } from '../entities/wildlife/animation';
import { createRig, getRigDef } from '../entities/wildlife/models';

const flying: AnimState = { behavior: 'flying', speed: 2, runSpeed: 4, time: 0, airborne: true, pitch: 0, bank: 0, atTarget: false };

/** Wing angle over consecutive frames of a fixed frame time. */
function wingAngles(model: string, dt: number, frames = 8): number[] {
  const rig = createRig(getRigDef(model), false);
  const out: number[] = [];
  for (let i = 0; i < frames; i++) {
    animateRig(rig, { ...flying, time: i * dt }, dt);
    out.push(rig.parts.wingL!.rotation.z);
  }
  return out;
}

describe('wing animation', () => {
  it('never freezes fast insect wings, whatever the frame time', () => {
    // 40 Hz wingbeats used to stand still at exactly 10, 20 and 40 frames per second.
    for (const model of ['bee', 'dragonfly']) {
      for (const dt of [0.1, 0.05, 0.025, 1 / 60, 1 / 144]) {
        const a = wingAngles(model, dt);
        const distinct = new Set(a.map((v) => v.toFixed(3))).size;
        expect(distinct, `${model} at ${Math.round(1 / dt)} fps`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('flaps butterflies and birds at their own rate', () => {
    for (const model of ['limeButterfly', 'egret', 'hornbill']) {
      const a = wingAngles(model, 1 / 60, 30);
      expect(Math.max(...a) - Math.min(...a), model).toBeGreaterThan(0.1);
    }
  });

  it('holds wings still on the ground', () => {
    const rig = createRig(getRigDef('bee'), false);
    const a: number[] = [];
    for (let i = 0; i < 5; i++) {
      animateRig(rig, { ...flying, behavior: 'idle', airborne: false, speed: 0, time: i / 60 }, 1 / 60);
      a.push(rig.parts.wingL!.rotation.z);
    }
    expect(new Set(a.map((v) => v.toFixed(4))).size).toBe(1);
  });
});
