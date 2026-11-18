import { describe, expect, it } from 'vitest';
import { QUESTS, type GameEvent } from '../data/quests/quests';
import { en } from '../i18n/en';
import { activeQuest, applyEvent, eventMatches, getProgress, initialQuestState, objectiveDone, objectiveFraction, questDone, type QuestState } from '../systems/quests/engine';

const run = (state: QuestState, events: GameEvent[]): QuestState => events.reduce((s, e) => applyEvent(s, e).state, state);

const M1: GameEvent[] = [
  { type: 'left-camp' },
  { type: 'moved', meters: 25 },
  { type: 'moved', meters: 20 },
  { type: 'animal-near', speciesId: 'rusa-unicolor' },
  { type: 'tool', tool: 'binoculars' },
  { type: 'photo', speciesId: 'rusa-unicolor', category: 'mammal', group: 'animal', quality: 55, biome: 'grassland' },
  { type: 'scan', speciesId: 'rusa-unicolor', category: 'mammal', group: 'animal', biome: 'grassland' },
  { type: 'journal-open' },
];

describe('quest definitions', () => {
  it('defines the five expeditions with localised text', () => {
    expect(QUESTS.map((q) => q.id)).toEqual(['first-steps', 'life-by-the-river', 'forest-biodiversity', 'hidden-ruins', 'master-naturalist']);
    for (const q of QUESTS) {
      expect(en[q.title]).toBeTruthy();
      for (const o of q.objectives) expect(en[o.text], `${q.id}/${o.id}`).toBeTruthy();
    }
  });
});

describe('quest state transitions', () => {
  it('starts on the first quest with nothing done', () => {
    const s = initialQuestState();
    expect(activeQuest(s)?.id).toBe('first-steps');
    expect(questDone(QUESTS[0]!, s)).toBe(false);
  });

  it('ignores events that match nothing', () => {
    const s = initialQuestState();
    expect(applyEvent(s, { type: 'tool', tool: 'nothing' }).state).toBe(s);
  });

  it('sums distance for the movement objective', () => {
    let s = initialQuestState();
    s = applyEvent(s, { type: 'moved', meters: 25 }).state;
    const move = QUESTS[0]!.objectives.find((o) => o.id === 'move')!;
    expect(objectiveDone(move, QUESTS[0]!, s)).toBe(false);
    expect(objectiveFraction(move, QUESTS[0]!, s)).toBeCloseTo(25 / 40);
    const u = applyEvent(s, { type: 'moved', meters: 20 });
    expect(u.completedObjectives).toEqual([{ questId: 'first-steps', objectiveId: 'move' }]);
  });

  it('applies where-filters: a plant photo does not satisfy "photograph an animal"', () => {
    const s = run(initialQuestState(), [{ type: 'photo', speciesId: 'nelumbo-nucifera', category: 'flower', group: 'plant', quality: 90, biome: 'freshwater' }]);
    expect(getProgress(s, 'first-steps', 'photo').count).toBe(0);
    expect(getProgress(s, 'life-by-the-river', 'water-plant').count).toBe(1);
  });

  it('completes mission 1 and advances to mission 2 on the last objective', () => {
    const s = run(initialQuestState(), M1);
    expect(s.activeIndex).toBe(0);
    const u = applyEvent(s, { type: 'species-viewed', speciesId: 'rusa-unicolor' });
    expect(u.completedQuests).toEqual(['first-steps']);
    expect(u.state.activeIndex).toBe(1);
    expect(u.state.completed).toContain('first-steps');
    expect(u.expeditionComplete).toBe(false);
  });

  it('counts distinct species only once', () => {
    const fish = (id: string): GameEvent => ({ type: 'discover', speciesId: id, category: 'fish', group: 'animal', biome: 'freshwater', forest: false });
    const s = run(initialQuestState(), [fish('channa-striata'), fish('channa-striata')]);
    expect(getProgress(s, 'life-by-the-river', 'fish').count).toBe(1);
    expect(getProgress(run(s, [fish('barbonymus-gonionotus')]), 'life-by-the-river', 'fish').count).toBe(2);
  });

  it('enforces minimum photo quality for high-quality objectives', () => {
    const photo = (q: number): GameEvent => ({ type: 'photo', speciesId: 'rusa-unicolor', category: 'mammal', group: 'animal', quality: q, biome: 'grassland' });
    const s = run(initialQuestState(), [photo(69), photo(70), photo(95)]);
    expect(getProgress(s, 'master-naturalist', 'photos').count).toBe(2);
  });

  it('completes summary objectives automatically', () => {
    const q = QUESTS[1]!;
    const summary = q.objectives.find((o) => o.kind === 'summary')!;
    let s = initialQuestState();
    expect(objectiveDone(summary, q, s)).toBe(false);
    s = run(s, [
      { type: 'biome', biome: 'freshwater' },
      { type: 'discover', speciesId: 'channa-striata', category: 'fish', group: 'animal', biome: 'freshwater', forest: false },
      { type: 'discover', speciesId: 'barbonymus-gonionotus', category: 'fish', group: 'animal', biome: 'freshwater', forest: false },
      { type: 'behavior', speciesId: 'channa-striata', category: 'fish', behavior: 'swimming', feeding: false, recorded: true, key: 'channa-striata:swimming' },
      { type: 'photo', speciesId: 'nelumbo-nucifera', category: 'flower', group: 'plant', quality: 50, biome: 'freshwater' },
    ]);
    expect(objectiveDone(summary, q, s)).toBe(true);
    // Mission 2 is satisfied but mission 1 is still active, so nothing completes yet.
    expect(s.activeIndex).toBe(0);
  });

  it('carries early progress forward and can complete several quests in one step', () => {
    let s = run(initialQuestState(), [
      { type: 'biome', biome: 'freshwater' },
      { type: 'discover', speciesId: 'channa-striata', category: 'fish', group: 'animal', biome: 'freshwater', forest: false },
      { type: 'discover', speciesId: 'barbonymus-gonionotus', category: 'fish', group: 'animal', biome: 'freshwater', forest: false },
      { type: 'behavior', speciesId: 'channa-striata', category: 'fish', behavior: 'swimming', feeding: false, recorded: true, key: 'channa-striata:swimming' },
      { type: 'photo', speciesId: 'nelumbo-nucifera', category: 'flower', group: 'plant', quality: 50, biome: 'freshwater' },
    ]);
    s = run(s, M1);
    const u = applyEvent(s, { type: 'species-viewed', speciesId: 'rusa-unicolor' });
    expect(u.completedQuests).toEqual(['first-steps', 'life-by-the-river']);
    expect(u.state.activeIndex).toBe(2);
  });

  it('reports expedition completion after the final quest', () => {
    const all = QUESTS.map((q) => q.id);
    const state: QuestState = { activeIndex: 4, completed: all.slice(0, 4), progress: {} };
    const discover = (i: number): GameEvent => ({ type: 'discover', speciesId: `sp-${i}`, category: 'bird', group: 'animal', biome: 'grassland', forest: false });
    let s = run(state, Array.from({ length: 15 }, (_, i) => discover(i)));
    s = run(s, Array.from({ length: 5 }, (): GameEvent => ({ type: 'photo', speciesId: 'x', category: 'bird', group: 'animal', quality: 80, biome: 'grassland' })));
    s = run(s, ['a', 'b', 'c'].map((k): GameEvent => ({ type: 'behavior', speciesId: k, category: 'bird', behavior: 'flying', feeding: false, recorded: true, key: `${k}:flying` })));
    s = run(s, ['grassland', 'rainforest', 'freshwater', 'mountain'].map((b): GameEvent => ({ type: 'biome', biome: b })));
    expect(s.activeIndex).toBe(4);
    const u = applyEvent(s, { type: 'biome', biome: 'ruins' });
    expect(u.expeditionComplete).toBe(true);
    expect(activeQuest(u.state)).toBeNull();
  });

  it('matches list filters', () => {
    const def = QUESTS[1]!.objectives.find((o) => o.id === 'water-plant')!;
    expect(eventMatches(def, { type: 'photo', speciesId: 'colocasia-esculenta', category: 'plant', group: 'plant', quality: 10, biome: 'freshwater' })).toBe(true);
    expect(eventMatches(def, { type: 'photo', speciesId: 'bombax-ceiba', category: 'tree', group: 'plant', quality: 10, biome: 'grassland' })).toBe(false);
  });
});
