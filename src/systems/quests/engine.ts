/**
 * Data-driven quest engine. Pure functions over immutable state: every game
 * event is matched against every quest's objectives (so progress made early
 * still counts later), but only the active quest can complete.
 */
import { QUESTS, type GameEvent, type ObjectiveDef, type QuestDef } from '../../data/quests/quests';

export interface ObjectiveProgress {
  count: number;
  /** Distinct values already counted (only for `distinctBy` objectives). */
  seen: string[];
}

export interface QuestState {
  /** Index of the active quest; equals quests.length when all are complete. */
  activeIndex: number;
  completed: string[];
  progress: Record<string, Record<string, ObjectiveProgress>>;
}

export interface QuestUpdate {
  state: QuestState;
  /** Objectives of the active quest that this event completed. */
  completedObjectives: { questId: string; objectiveId: string }[];
  completedQuests: string[];
  /** True if the final quest was completed by this event. */
  expeditionComplete: boolean;
}

export function initialQuestState(): QuestState {
  return { activeIndex: 0, completed: [], progress: {} };
}

const emptyProgress = (): ObjectiveProgress => ({ count: 0, seen: [] });

export function getProgress(state: QuestState, questId: string, objectiveId: string): ObjectiveProgress {
  return state.progress[questId]?.[objectiveId] ?? emptyProgress();
}

export function eventMatches(def: ObjectiveDef, event: GameEvent): boolean {
  if (def.kind !== 'event' || def.event !== event.type) return false;
  const fields = event as unknown as Record<string, unknown>;
  if (def.where) {
    for (const [key, want] of Object.entries(def.where)) {
      const got = fields[key];
      if (Array.isArray(want)) {
        if (!want.includes(got as never)) return false;
      } else if (got !== want) {
        return false;
      }
    }
  }
  if (def.min) {
    for (const [key, min] of Object.entries(def.min)) {
      const got = fields[key];
      if (typeof got !== 'number' || got < min) return false;
    }
  }
  return true;
}

export function objectiveDone(def: ObjectiveDef, quest: QuestDef, state: QuestState): boolean {
  if (def.kind === 'summary') {
    return quest.objectives.filter((o) => o.kind !== 'summary').every((o) => objectiveDone(o, quest, state));
  }
  return getProgress(state, quest.id, def.id).count >= def.count;
}

export function questDone(quest: QuestDef, state: QuestState): boolean {
  return quest.objectives.every((o) => objectiveDone(o, quest, state));
}

/** 0..1 completion of a single objective, for progress bars. */
export function objectiveFraction(def: ObjectiveDef, quest: QuestDef, state: QuestState): number {
  if (def.kind === 'summary') return objectiveDone(def, quest, state) ? 1 : 0;
  return Math.min(1, getProgress(state, quest.id, def.id).count / def.count);
}

function advance(def: ObjectiveDef, prog: ObjectiveProgress, event: GameEvent): ObjectiveProgress {
  const fields = event as unknown as Record<string, unknown>;
  if (def.distinctBy) {
    const value = String(fields[def.distinctBy]);
    if (prog.seen.includes(value)) return prog;
    return { count: prog.count + 1, seen: [...prog.seen, value] };
  }
  if (def.sumField) {
    const add = fields[def.sumField];
    return { count: prog.count + (typeof add === 'number' ? add : 0), seen: prog.seen };
  }
  return { count: prog.count + 1, seen: prog.seen };
}

export function applyEvent(prev: QuestState, event: GameEvent, quests: readonly QuestDef[] = QUESTS): QuestUpdate {
  const active = quests[prev.activeIndex];
  const before = active ? new Set(active.objectives.filter((o) => objectiveDone(o, active, prev)).map((o) => o.id)) : new Set<string>();

  let changed = false;
  const progress: QuestState['progress'] = { ...prev.progress };
  for (const quest of quests) {
    if (prev.completed.includes(quest.id)) continue;
    for (const def of quest.objectives) {
      if (!eventMatches(def, event)) continue;
      const current = progress[quest.id]?.[def.id] ?? emptyProgress();
      if (!def.distinctBy && !def.sumField && current.count >= def.count) continue;
      const next = advance(def, current, event);
      if (next !== current) {
        progress[quest.id] = { ...(progress[quest.id] ?? {}), [def.id]: next };
        changed = true;
      }
    }
  }
  if (!changed) return { state: prev, completedObjectives: [], completedQuests: [], expeditionComplete: false };

  let state: QuestState = { ...prev, progress };
  const completedObjectives: QuestUpdate['completedObjectives'] = [];
  if (active) {
    for (const o of active.objectives) {
      if (!before.has(o.id) && objectiveDone(o, active, state)) completedObjectives.push({ questId: active.id, objectiveId: o.id });
    }
  }
  const completedQuests: string[] = [];
  // A later quest may already be satisfied by earlier progress, so keep advancing.
  while (state.activeIndex < quests.length && questDone(quests[state.activeIndex]!, state)) {
    const q = quests[state.activeIndex]!;
    completedQuests.push(q.id);
    state = { ...state, completed: [...state.completed, q.id], activeIndex: state.activeIndex + 1 };
  }
  return {
    state,
    completedObjectives,
    completedQuests,
    expeditionComplete: completedQuests.length > 0 && state.activeIndex >= quests.length,
  };
}

export function activeQuest(state: QuestState, quests: readonly QuestDef[] = QUESTS): QuestDef | null {
  return quests[state.activeIndex] ?? null;
}
