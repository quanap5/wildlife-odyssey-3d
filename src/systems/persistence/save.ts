/**
 * Save-game schema, validation and migrations. `parseSave` never throws: a
 * record that cannot be understood is reported as corrupt so the caller can
 * keep a backup instead of silently discarding the player's research.
 */
import { SAVE_VERSION } from '../../config';
import { initialQuestState, type QuestState } from '../quests/engine';
import type { GameStorage } from './db';

export type ResearchRole = 'biologist' | 'archaeologist';

export interface DiscoveryRecord {
  speciesId: string;
  at: number;
  location: [number, number, number];
  biome: string;
  method: 'scan' | 'photo';
  scanned: boolean;
  bestQuality: number;
  behaviors: string[];
  viewed: boolean;
}

export interface PhotoMeta {
  id: string;
  speciesId: string | null;
  timestamp: number;
  imageBlobId: string;
  quality: number;
  rating: string;
  location: [number, number, number];
  biome: string;
  observedBehavior?: string;
  width: number;
  height: number;
}

export interface VideoMeta {
  id: string;
  speciesId: string | null;
  timestamp: number;
  blobId: string;
  mime: string;
  seconds: number;
  bytes: number;
  location: [number, number, number];
  biome: string;
  behaviors: string[];
  /** World speed while recording (1, 0.5, 0.25). */
  simScale: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  role: ResearchRole;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  hour: number;
  discovered: Record<string, DiscoveryRecord>;
  quest: QuestState;
  photos: PhotoMeta[];
  videos: VideoMeta[];
  visitedBiomes: string[];
  /** Indices of explored 32 m map cells. */
  explored: number[];
  landmarks: string[];
  notes: string[];
  artifacts: string[];
  badges: string[];
  /** `${speciesId}:${behavior}` pairs captured on video. */
  behaviorsRecorded: string[];
  feedingObserved: string[];
  waypoint: [number, number] | null;
  stats: { distance: number; playSeconds: number; scans: number };
  completionShown: boolean;
}

export const SAVE_KEY = 'slot-1';

export type ParseResult = { ok: true; data: SaveData; migrated: boolean } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Migrations, applied in order. Each takes the previous version's shape and
 * returns the next. v1 (first prototype) had no behaviour log, exploration
 * grid, waypoint or completion flag.
 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({
    ...old,
    version: 2,
    behaviorsRecorded: [],
    feedingObserved: [],
    explored: [],
    waypoint: null,
    completionShown: false,
  }),
};

export function migrate(raw: Record<string, unknown>): { data: Record<string, unknown>; migrated: boolean } {
  let data = raw;
  let migrated = false;
  let guard = 0;
  while (isNum(data.version) && data.version < SAVE_VERSION && guard++ < 20) {
    const step = MIGRATIONS[data.version];
    if (!step) throw new Error(`No migration from save version ${data.version}`);
    data = step(data);
    migrated = true;
  }
  return { data, migrated };
}

export function parseSave(raw: unknown): ParseResult {
  try {
    if (!isObj(raw)) return { ok: false, error: 'save is not an object' };
    if (!isNum(raw.version)) return { ok: false, error: 'missing version' };
    if (raw.version > SAVE_VERSION) return { ok: false, error: `save version ${raw.version} is newer than this build` };
    const { data: d, migrated } = migrate(raw);
    const p = d.player;
    if (!isObj(p) || !isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.yaw)) return { ok: false, error: 'bad player position' };
    if (d.role !== 'biologist' && d.role !== 'archaeologist') return { ok: false, error: 'bad role' };
    if (!isObj(d.discovered)) return { ok: false, error: 'bad discoveries' };
    const q = d.quest;
    if (!isObj(q) || !isNum(q.activeIndex) || !Array.isArray(q.completed) || !isObj(q.progress)) return { ok: false, error: 'bad quest state' };
    if (!Array.isArray(d.photos) || !Array.isArray(d.videos)) return { ok: false, error: 'bad media index' };
    const stats = isObj(d.stats) ? d.stats : {};
    const wp = d.waypoint;
    const data: SaveData = {
      version: SAVE_VERSION,
      savedAt: isNum(d.savedAt) ? d.savedAt : Date.now(),
      role: d.role,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: isNum(p.pitch) ? p.pitch : 0 },
      hour: isNum(d.hour) ? d.hour : 8,
      discovered: d.discovered as Record<string, DiscoveryRecord>,
      quest: { activeIndex: q.activeIndex, completed: strArr(q.completed), progress: q.progress as QuestState['progress'] },
      photos: d.photos as PhotoMeta[],
      videos: d.videos as VideoMeta[],
      visitedBiomes: strArr(d.visitedBiomes),
      explored: Array.isArray(d.explored) ? d.explored.filter(isNum) : [],
      landmarks: strArr(d.landmarks),
      notes: strArr(d.notes),
      artifacts: strArr(d.artifacts),
      badges: strArr(d.badges),
      behaviorsRecorded: strArr(d.behaviorsRecorded),
      feedingObserved: strArr(d.feedingObserved),
      waypoint: Array.isArray(wp) && isNum(wp[0]) && isNum(wp[1]) ? [wp[0], wp[1]] : null,
      stats: {
        distance: isNum(stats.distance) ? stats.distance : 0,
        playSeconds: isNum(stats.playSeconds) ? stats.playSeconds : 0,
        scans: isNum(stats.scans) ? stats.scans : 0,
      },
      completionShown: d.completionShown === true,
    };
    return { ok: true, data, migrated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function newSave(role: ResearchRole, spawn: { x: number; y: number; z: number; yaw: number }): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    role,
    player: { ...spawn, pitch: 0 },
    hour: 7.5,
    discovered: {},
    quest: initialQuestState(),
    photos: [],
    videos: [],
    visitedBiomes: [],
    explored: [],
    landmarks: [],
    notes: [],
    artifacts: [],
    badges: [],
    behaviorsRecorded: [],
    feedingObserved: [],
    waypoint: null,
    stats: { distance: 0, playSeconds: 0, scans: 0 },
    completionShown: false,
  };
}

/** JSON round trip used by tests and by the localStorage mirror. */
export const serializeSave = (data: SaveData): string => JSON.stringify(data);
export const deserializeSave = (text: string): ParseResult => {
  try {
    return parseSave(JSON.parse(text));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid JSON' };
  }
};

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; data: SaveData }
  | { status: 'corrupt'; error: string; backupKey: string };

export async function writeSave(storage: GameStorage, data: SaveData): Promise<void> {
  await storage.put('saves', SAVE_KEY, { ...data, savedAt: Date.now() });
}

/** Loads the save. A corrupt record is copied to a backup key, never deleted. */
export async function loadSave(storage: GameStorage): Promise<LoadResult> {
  const raw = await storage.get<unknown>('saves', SAVE_KEY);
  if (raw === undefined) return { status: 'none' };
  const parsed = parseSave(raw);
  if (parsed.ok) {
    if (parsed.migrated) await storage.put('saves', SAVE_KEY, parsed.data);
    return { status: 'ok', data: parsed.data };
  }
  const backupKey = `corrupt-${Date.now()}`;
  await storage.put('saves', backupKey, raw);
  return { status: 'corrupt', error: parsed.error, backupKey };
}

/** Removes the save and all media. Backups of corrupt saves are kept. */
export async function resetProgress(storage: GameStorage): Promise<void> {
  await storage.delete('saves', SAVE_KEY);
  await storage.clear('photos');
  await storage.clear('videos');
}
