/**
 * Quick View model (pure): what the player has collected, most recent first,
 * and which of it is new since the panel was last looked at. Reads only what
 * the store already holds; nothing here is saved.
 */
import { QUESTS } from '../../data/quests/quests';
import { SPECIES } from '../../data/species';
import { INTERACTABLES } from '../../world/structures/structures';
import { LANDMARKS } from '../../world/terrain/layout';
import type { DiscoveryRecord, PhotoMeta, VideoMeta } from '../persistence/save';

export const COLLECTION_KINDS = ['species', 'photos', 'videos', 'artifacts', 'notes', 'landmarks', 'badges'] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/** The parts of the game state Quick View reads. */
export interface CollectionSource {
  discovered: Record<string, DiscoveryRecord>;
  photos: readonly PhotoMeta[];
  videos: readonly VideoMeta[];
  artifacts: readonly string[];
  notes: readonly string[];
  landmarks: readonly string[];
  badges: readonly string[];
}

/** Ids already seen in Quick View, per collection. Session state only. */
export type QuickSeen = Record<CollectionKind, readonly string[]>;

export interface QuickRow {
  kind: CollectionKind;
  count: number;
  /** Size of the full set where it is fixed (36 species, 5 badges), otherwise null. */
  total: number | null;
  /** Most recent ids, newest first, at most `RECENT_LIMIT[kind]`. */
  recent: string[];
  /** Ids collected since the panel was last closed, newest first. */
  fresh: string[];
  empty: boolean;
}

/** How many recent items each row shows. */
export const RECENT_LIMIT: Record<CollectionKind, number> = { species: 5, photos: 3, videos: 1, artifacts: 3, notes: 2, landmarks: 3, badges: 5 };

const NOTE_IDS: ReadonlySet<string> = new Set(INTERACTABLES.filter((i) => i.kind === 'note').map((i) => i.id));
const ARTIFACT_TOTAL = INTERACTABLES.filter((i) => i.kind === 'artifact').length;

export const COLLECTION_TOTALS: Record<CollectionKind, number | null> = {
  species: SPECIES.length,
  photos: null,
  videos: null,
  artifacts: ARTIFACT_TOTAL,
  notes: NOTE_IDS.size,
  landmarks: LANDMARKS.length,
  badges: QUESTS.length,
};

/** Every collected id per collection, oldest first. */
export function collectionIds(s: CollectionSource): Record<CollectionKind, string[]> {
  return {
    species: Object.values(s.discovered)
      .slice()
      .sort((a, b) => a.at - b.at)
      .map((r) => r.speciesId),
    photos: s.photos
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => p.id),
    videos: s.videos
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((v) => v.id),
    artifacts: [...s.artifacts],
    // `notes` also records signs, steles and tracks that were read; only written field notes count here.
    notes: s.notes.filter((id) => NOTE_IDS.has(id)),
    landmarks: [...s.landmarks],
    badges: [...s.badges],
  };
}

/** Snapshot taken when the panel closes (and when a session starts): everything in it counts as seen. */
export function snapshotSeen(s: CollectionSource): QuickSeen {
  return collectionIds(s);
}

export const emptySeen = (): QuickSeen => ({ species: [], photos: [], videos: [], artifacts: [], notes: [], landmarks: [], badges: [] });

export function quickViewRows(s: CollectionSource, seen: QuickSeen): QuickRow[] {
  const ids = collectionIds(s);
  return COLLECTION_KINDS.map((kind) => {
    const all = ids[kind];
    const known = new Set(seen[kind]);
    const newestFirst = all.slice().reverse();
    return {
      kind,
      count: all.length,
      total: COLLECTION_TOTALS[kind],
      recent: newestFirst.slice(0, RECENT_LIMIT[kind]),
      fresh: newestFirst.filter((id) => !known.has(id)),
      empty: all.length === 0,
    };
  });
}

/** True when anything was collected since Quick View was last closed. Drives the dot on the collection badge. */
export function hasFreshItems(s: CollectionSource, seen: QuickSeen): boolean {
  const ids = collectionIds(s);
  return COLLECTION_KINDS.some((kind) => {
    const known = new Set(seen[kind]);
    return ids[kind].some((id) => !known.has(id));
  });
}

/** Highest photo score so far, or null without photographs. */
export function bestPhotoScore(photos: readonly PhotoMeta[]): number | null {
  return photos.length ? Math.round(Math.max(...photos.map((p) => p.quality))) : null;
}
