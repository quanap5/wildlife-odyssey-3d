/**
 * Expedition definitions. Purely declarative: the quest engine matches game
 * events against these objectives, so new missions need no engine changes.
 */
import type { TextKey } from '../../i18n/en';

export type GameEvent =
  | { type: 'moved'; meters: number }
  | { type: 'left-camp' }
  | { type: 'tool'; tool: string }
  | { type: 'animal-near'; speciesId: string }
  | { type: 'photo'; speciesId: string; category: string; group: 'animal' | 'plant'; quality: number; biome: string }
  | { type: 'scan'; speciesId: string; category: string; group: 'animal' | 'plant'; biome: string }
  | { type: 'discover'; speciesId: string; category: string; group: 'animal' | 'plant'; biome: string; forest: boolean }
  | { type: 'journal-open' }
  | { type: 'species-viewed'; speciesId: string }
  | { type: 'biome'; biome: string }
  | { type: 'behavior'; speciesId: string; category: string; behavior: string; feeding: boolean; recorded: boolean; key: string }
  | { type: 'artifact'; id: string }
  | { type: 'landmark'; id: string }
  | { type: 'document'; id: string };

export type GameEventType = GameEvent['type'];
type Scalar = string | number | boolean;

export interface ObjectiveDef {
  id: string;
  text: TextKey;
  /** 'summary' objectives complete automatically once the others are done. */
  kind: 'event' | 'summary';
  event?: GameEventType;
  /** Event fields that must match (a list means "any of"). */
  where?: Record<string, Scalar | readonly Scalar[]>;
  /** Event numeric fields that must be at least this value. */
  min?: Record<string, number>;
  /** Count distinct values of this event field instead of raw events. */
  distinctBy?: string;
  /** Add up this numeric event field instead of counting events. */
  sumField?: string;
  count: number;
}

export interface QuestDef {
  id: string;
  title: TextKey;
  description: TextKey;
  objectives: ObjectiveDef[];
  /** Badge id awarded on completion. */
  badge: string;
  badgeName: TextKey;
}

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'first-steps',
    title: 'quest.m1.title',
    description: 'quest.m1.desc',
    badge: 'first-researcher',
    badgeName: 'badge.firstResearcher',
    objectives: [
      { id: 'leave-camp', text: 'quest.m1.o1', kind: 'event', event: 'left-camp', count: 1 },
      { id: 'move', text: 'quest.m1.o2', kind: 'event', event: 'moved', sumField: 'meters', count: 40 },
      { id: 'locate', text: 'quest.m1.o3', kind: 'event', event: 'animal-near', count: 1 },
      { id: 'binoculars', text: 'quest.m1.o4', kind: 'event', event: 'tool', where: { tool: 'binoculars' }, count: 1 },
      { id: 'photo', text: 'quest.m1.o5', kind: 'event', event: 'photo', where: { group: 'animal' }, count: 1 },
      { id: 'scan', text: 'quest.m1.o6', kind: 'event', event: 'scan', where: { group: 'animal' }, count: 1 },
      { id: 'journal', text: 'quest.m1.o7', kind: 'event', event: 'journal-open', count: 1 },
      { id: 'review', text: 'quest.m1.o8', kind: 'event', event: 'species-viewed', count: 1 },
    ],
  },
  {
    id: 'life-by-the-river',
    title: 'quest.m2.title',
    description: 'quest.m2.desc',
    badge: 'freshwater-surveyor',
    badgeName: 'badge.freshwater',
    objectives: [
      { id: 'travel', text: 'quest.m2.o1', kind: 'event', event: 'biome', where: { biome: 'freshwater' }, count: 1 },
      { id: 'fish', text: 'quest.m2.o2', kind: 'event', event: 'discover', where: { category: 'fish' }, distinctBy: 'speciesId', count: 2 },
      { id: 'record', text: 'quest.m2.o3', kind: 'event', event: 'behavior', where: { category: 'fish', recorded: true }, count: 1 },
      { id: 'water-plant', text: 'quest.m2.o4', kind: 'event', event: 'photo', where: { speciesId: ['nelumbo-nucifera', 'colocasia-esculenta'] }, count: 1 },
      { id: 'survey', text: 'quest.m2.o5', kind: 'summary', count: 1 },
    ],
  },
  {
    id: 'forest-biodiversity',
    title: 'quest.m3.title',
    description: 'quest.m3.desc',
    badge: 'forest-ecologist',
    badgeName: 'badge.forest',
    objectives: [
      { id: 'plants', text: 'quest.m3.o1', kind: 'event', event: 'discover', where: { group: 'plant', forest: true }, distinctBy: 'speciesId', count: 3 },
      { id: 'birds', text: 'quest.m3.o2', kind: 'event', event: 'photo', where: { category: 'bird' }, distinctBy: 'speciesId', count: 2 },
      { id: 'feeding', text: 'quest.m3.o3', kind: 'event', event: 'behavior', where: { feeding: true }, count: 1 },
      { id: 'journal', text: 'quest.m3.o4', kind: 'summary', count: 1 },
    ],
  },
  {
    id: 'hidden-ruins',
    title: 'quest.m4.title',
    description: 'quest.m4.desc',
    badge: 'field-archaeologist',
    badgeName: 'badge.ruins',
    objectives: [
      { id: 'locate', text: 'quest.m4.o1', kind: 'event', event: 'landmark', where: { id: 'ruins' }, count: 1 },
      { id: 'artifact', text: 'quest.m4.o2', kind: 'event', event: 'artifact', count: 1 },
      { id: 'fig', text: 'quest.m4.o3', kind: 'event', event: 'photo', where: { speciesId: 'ficus-religiosa' }, count: 1 },
      { id: 'document', text: 'quest.m4.o4', kind: 'event', event: 'document', where: { id: 'ruins' }, count: 1 },
    ],
  },
  {
    id: 'master-naturalist',
    title: 'quest.m5.title',
    description: 'quest.m5.desc',
    badge: 'master-naturalist',
    badgeName: 'badge.master',
    objectives: [
      { id: 'species', text: 'quest.m5.o1', kind: 'event', event: 'discover', distinctBy: 'speciesId', count: 15 },
      { id: 'photos', text: 'quest.m5.o2', kind: 'event', event: 'photo', min: { quality: 70 }, count: 5 },
      { id: 'behaviors', text: 'quest.m5.o3', kind: 'event', event: 'behavior', where: { recorded: true }, distinctBy: 'key', count: 3 },
      { id: 'biomes', text: 'quest.m5.o4', kind: 'event', event: 'biome', distinctBy: 'biome', count: 5 },
      { id: 'expedition', text: 'quest.m5.o5', kind: 'summary', count: 1 },
    ],
  },
];
