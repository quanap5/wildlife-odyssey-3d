import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../config';
import { IndexedDbStorage, MemoryStorage, openIndexedDb, type GameStorage } from '../systems/persistence/db';
import { SAVE_KEY, deserializeSave, loadSave, newSave, parseSave, resetProgress, serializeSave, writeSave, type SaveData } from '../systems/persistence/save';

function sample(): SaveData {
  const s = newSave('biologist', { x: 3, y: 4.2, z: 65, yaw: 2.2 });
  s.discovered['rusa-unicolor'] = { speciesId: 'rusa-unicolor', at: 1, location: [1, 2, 3], biome: 'grassland', method: 'scan', scanned: true, bestQuality: 82, behaviors: ['feeding'], viewed: true };
  s.photos.push({ id: 'p1', speciesId: 'rusa-unicolor', timestamp: 5, imageBlobId: 'p1', quality: 82, rating: 'good', location: [1, 2, 3], biome: 'grassland', width: 1280, height: 720 });
  s.quest = { activeIndex: 1, completed: ['first-steps'], progress: { 'life-by-the-river': { fish: { count: 1, seen: ['channa-striata'] } } } };
  s.visitedBiomes = ['grassland', 'freshwater'];
  s.explored = [1, 2, 33];
  s.waypoint = [120, -40];
  s.stats = { distance: 512.5, playSeconds: 300, scans: 4 };
  return s;
}

describe('save serialisation', () => {
  it('round-trips through JSON without loss', () => {
    const original = sample();
    const parsed = deserializeSave(serializeSave(original));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toEqual(original);
      expect(parsed.migrated).toBe(false);
    }
  });

  it('rejects corrupt input without throwing', () => {
    for (const bad of [null, 42, 'x', [], {}, { version: 2 }, { ...sample(), player: { x: 'a' } }, { ...sample(), role: 'pirate' }, { ...sample(), quest: 3 }]) {
      expect(parseSave(bad).ok, JSON.stringify(bad)?.slice(0, 40)).toBe(false);
    }
    expect(deserializeSave('{not json').ok).toBe(false);
  });

  it('refuses saves from a newer build instead of mangling them', () => {
    const r = parseSave({ ...sample(), version: SAVE_VERSION + 1 });
    expect(r.ok).toBe(false);
  });

  it('migrates a version 1 save and keeps its research', () => {
    const v1: Record<string, unknown> = { ...sample(), version: 1 };
    for (const k of ['behaviorsRecorded', 'feedingObserved', 'explored', 'waypoint', 'completionShown']) delete v1[k];
    const r = parseSave(v1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migrated).toBe(true);
      expect(r.data.version).toBe(SAVE_VERSION);
      expect(r.data.behaviorsRecorded).toEqual([]);
      expect(r.data.waypoint).toBeNull();
      expect(Object.keys(r.data.discovered)).toEqual(['rusa-unicolor']);
      expect(r.data.photos.length).toBe(1);
    }
  });

  it('repairs missing optional fields with safe defaults', () => {
    const partial: Record<string, unknown> = { ...sample() };
    delete partial.stats;
    delete partial.landmarks;
    const r = parseSave(partial);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.stats).toEqual({ distance: 0, playSeconds: 0, scans: 0 });
      expect(r.data.landmarks).toEqual([]);
    }
  });
});

function storageSuite(name: string, make: () => Promise<GameStorage>): void {
  describe(`storage backend: ${name}`, () => {
    let storage: GameStorage;
    beforeEach(async () => {
      storage = await make();
    });

    it('reports no save for a first-time player', async () => {
      expect(await loadSave(storage)).toEqual({ status: 'none' });
    });

    it('writes and reloads a save', async () => {
      await writeSave(storage, sample());
      const r = await loadSave(storage);
      expect(r.status).toBe('ok');
      if (r.status === 'ok') {
        expect(r.data.player.z).toBe(65);
        expect(r.data.discovered['rusa-unicolor']?.bestQuality).toBe(82);
        expect(r.data.quest.activeIndex).toBe(1);
      }
    });

    it('keeps a backup of a corrupt save instead of discarding it', async () => {
      await storage.put('saves', SAVE_KEY, { version: 2, garbage: true });
      const r = await loadSave(storage);
      expect(r.status).toBe('corrupt');
      if (r.status === 'corrupt') {
        expect(await storage.get('saves', r.backupKey)).toEqual({ version: 2, garbage: true });
      }
      // The original record is still there too.
      expect(await storage.get('saves', SAVE_KEY)).toBeDefined();
    });

    it('stores binary media and clears it on reset', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      await storage.put('photos', 'p1', { blob: bytes, thumb: bytes });
      await storage.put('videos', 'v1', bytes);
      await writeSave(storage, sample());
      expect(await storage.keys('photos')).toEqual(['p1']);
      await resetProgress(storage);
      expect(await storage.keys('photos')).toEqual([]);
      expect(await storage.keys('videos')).toEqual([]);
      expect(await loadSave(storage)).toEqual({ status: 'none' });
    });

    it('returns undefined for missing media', async () => {
      expect(await storage.get('photos', 'missing')).toBeUndefined();
      await storage.delete('photos', 'missing');
    });
  });
}

storageSuite('memory fallback', async () => new MemoryStorage());
storageSuite('IndexedDB', async () => new IndexedDbStorage(await openIndexedDb(new IDBFactory(), `test-${Math.random()}`)));

describe('storage flags', () => {
  it('marks the memory fallback as non-persistent', async () => {
    expect(new MemoryStorage().persistent).toBe(false);
    expect(new IndexedDbStorage(await openIndexedDb(new IDBFactory(), 'flags')).persistent).toBe(true);
  });
});
