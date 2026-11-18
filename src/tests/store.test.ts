import { beforeEach, describe, expect, it } from 'vitest';
import { progressSummary, useGame } from '../store/gameStore';
import { runtime } from '../store/runtime';
import { parseSave } from '../systems/persistence/save';
import type { PhotoMeta } from '../systems/persistence/save';
import { scorePhoto } from '../systems/photography/quality';

const photo = (speciesId: string, quality: number, id = `p-${Math.random()}`): PhotoMeta => ({
  id,
  speciesId,
  timestamp: Date.now(),
  imageBlobId: id,
  quality,
  rating: 'good',
  location: [1, 2, 3],
  biome: 'grassland',
  width: 1280,
  height: 720,
});

beforeEach(() => {
  useGame.getState().startNew('biologist');
});

describe('discovery tracking', () => {
  it('records a new species once, with where and how it was found', () => {
    const g = useGame.getState();
    expect(g.discover('rusa-unicolor', 'photo', [10, 4, 20], 'grassland')).toBe(true);
    expect(g.discover('rusa-unicolor', 'photo', [99, 9, 99], 'rainforest')).toBe(false);
    const rec = useGame.getState().discovered['rusa-unicolor'];
    expect(rec?.location).toEqual([10, 4, 20]);
    expect(rec?.biome).toBe('grassland');
    expect(rec?.scanned).toBe(false);
    expect(useGame.getState().notices.some((n) => n.kind === 'discovery')).toBe(true);
  });

  it('upgrades a photo discovery when the species is later scanned', () => {
    const g = useGame.getState();
    g.discover('rusa-unicolor', 'photo', [0, 0, 0], 'grassland');
    g.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland');
    expect(useGame.getState().discovered['rusa-unicolor']?.scanned).toBe(true);
  });

  it('ignores unknown species ids', () => {
    expect(useGame.getState().discover('not-a-species', 'scan', [0, 0, 0], 'grassland')).toBe(false);
    expect(Object.keys(useGame.getState().discovered)).toEqual([]);
  });

  it('feeds discoveries into quest progress', () => {
    const g = useGame.getState();
    g.discover('channa-striata', 'scan', [0, 0, 0], 'freshwater');
    g.discover('barbonymus-gonionotus', 'scan', [0, 0, 0], 'freshwater');
    expect(useGame.getState().quest.progress['life-by-the-river']?.fish?.count).toBe(2);
  });

  it('tracks best photo quality and unlocks field notes at 70', () => {
    const g = useGame.getState();
    g.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland');
    g.recordPhoto(photo('rusa-unicolor', 40), scorePhoto({ visibility: 1, frameFraction: 0.1, offCenter: 0, distance: 50, screenSpeed: 0, focus: 0.5, light: 0.8, exposure: 0 }));
    expect(useGame.getState().discovered['rusa-unicolor']?.bestQuality).toBe(40);
    g.recordPhoto(photo('rusa-unicolor', 84), null);
    g.recordPhoto(photo('rusa-unicolor', 60), null);
    expect(useGame.getState().discovered['rusa-unicolor']?.bestQuality).toBe(84);
    const sum = progressSummary(useGame.getState());
    expect(sum.photos).toBe(3);
    expect(sum.hqPhotos).toBe(1);
  });

  it('records each observed and recorded behaviour once', () => {
    const g = useGame.getState();
    g.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland');
    g.recordBehavior('rusa-unicolor', 'feeding', false);
    g.recordBehavior('rusa-unicolor', 'feeding', false);
    g.recordBehavior('rusa-unicolor', 'walking', true);
    g.recordBehavior('rusa-unicolor', 'walking', true);
    const s = useGame.getState();
    expect(s.feedingObserved).toEqual(['rusa-unicolor']);
    expect(s.behaviorsRecorded).toEqual(['rusa-unicolor:walking']);
    expect(s.discovered['rusa-unicolor']?.behaviors.sort()).toEqual(['feeding', 'walking']);
    expect(s.quest.progress['forest-biodiversity']?.feeding?.count).toBe(1);
  });

  it('tracks biomes, landmarks, notes and artifacts without duplicates', () => {
    const g = useGame.getState();
    g.visitBiome('grassland');
    g.visitBiome('grassland');
    g.visitBiome('ruins');
    expect(g.visitLandmark('ruins')).toBe(true);
    expect(useGame.getState().visitLandmark('ruins')).toBe(false);
    expect(g.collectNote('note1')).toBe(true);
    expect(useGame.getState().collectNote('note1')).toBe(false);
    expect(g.collectArtifact('jar')).toBe(true);
    const s = useGame.getState();
    expect(s.visitedBiomes).toEqual(['grassland', 'ruins']);
    expect(s.landmarks).toEqual(['ruins']);
    expect(s.artifacts).toEqual(['jar']);
  });

  it('gives the archaeologist the ruins on the map from the start', () => {
    useGame.getState().startNew('archaeologist');
    expect(useGame.getState().landmarks).toEqual(['ruins']);
    expect(useGame.getState().role).toBe('archaeologist');
  });
});

describe('save snapshot of the live game', () => {
  it('captures position, discoveries, photos and quests and restores them', () => {
    const g = useGame.getState();
    runtime.player.pos.set(123, 7.5, -88);
    runtime.player.yaw = 1.25;
    runtime.time.hour = 16.5;
    g.discover('alcedo-atthis', 'scan', [100, 1, 0], 'freshwater');
    g.recordPhoto(photo('alcedo-atthis', 77, 'keep'), null);
    g.setWaypoint([50, 60]);
    g.emit({ type: 'left-camp' });
    const snapshot = JSON.parse(JSON.stringify(useGame.getState().toSave())) as unknown;
    const parsed = parseSave(snapshot);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    useGame.getState().startNew('archaeologist');
    runtime.player.pos.set(0, 0, 0);
    useGame.getState().applySave(parsed.data);
    const s = useGame.getState();
    expect(s.role).toBe('biologist');
    expect(s.screen).toBe('playing');
    expect(Object.keys(s.discovered)).toEqual(['alcedo-atthis']);
    expect(s.photos.map((p) => p.id)).toEqual(['keep']);
    expect(s.waypoint).toEqual([50, 60]);
    expect(s.quest.progress['first-steps']?.['leave-camp']?.count).toBe(1);
    expect(runtime.player.pos.toArray()).toEqual([123, 7.5, -88]);
    expect(runtime.player.yaw).toBeCloseTo(1.25);
    expect(runtime.time.hour).toBeCloseTo(16.5);
  });
});
