import { describe, expect, it } from 'vitest';
import { MINIMAP } from '../config';
import { approach, easeInOut, resolveBoom } from '../engine/camera/boom';
import { copyIncludesViewModel, planFrame } from '../engine/rendering/framePlan';
import { HELD_ITEMS, LENS_ITEMS, LOWER_TIME, RAISE_TIME, REST_POSE, STOW_DROP, TOOL_ITEM, buildProp, isHeldItem, resolveHeldItem, stepHeld, viewModelPose, type HeldState } from '../entities/player/heldItems';
import { DEFAULT_SETTINGS, normalizeSettings, useGame, type Tool } from '../store/gameStore';
import { COLLECTION_KINDS, COLLECTION_TOTALS, RECENT_LIMIT, bestPhotoScore, collectionIds, emptySeen, hasFreshItems, quickViewRows, snapshotSeen, type CollectionSource } from '../systems/collection/quickView';
import type { DiscoveryRecord, PhotoMeta, VideoMeta } from '../systems/persistence/save';
import { quickViewAllowed } from '../systems/interaction/controls';
import { TOOLBAR, activeToolbarEntry, contextBadges, formatClock, formatCoords, isDaytime } from '../ui/hud/hudModel';
import { arrowRotation, clampToRim, headingRad, nextZoom, northMarker, worldToMinimap, zoomRadius, type MinimapView } from '../ui/map/minimap';

const view = (over: Partial<MinimapView> = {}): MinimapView => ({ cx: 100, cz: -40, yaw: 0, radius: 120, size: 160, rotate: false, ...over });
const near = (a: number, b: number, eps = 1e-6): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('minimap geometry', () => {
  it('puts the player at the centre in both modes and at every zoom level', () => {
    for (const rotate of [false, true]) {
      for (let z = 0; z < MINIMAP.radii.length; z++) {
        const v = view({ rotate, radius: zoomRadius(z), yaw: 1.1 });
        const p = worldToMinimap(v.cx, v.cz, v);
        near(p.x, 80);
        near(p.y, 80);
        near(p.r, 0);
      }
    }
  });

  it('north-up: north is up and east is right, scaled so the radius reaches the rim', () => {
    for (let z = 0; z < MINIMAP.radii.length; z++) {
      const v = view({ radius: zoomRadius(z) });
      const north = worldToMinimap(v.cx, v.cz - v.radius, v);
      near(north.x, 80);
      near(north.y, 0);
      near(north.r, 1);
      const east = worldToMinimap(v.cx + v.radius / 2, v.cz, v);
      near(east.x, 120);
      near(east.y, 80);
      near(east.r, 0.5);
    }
  });

  it('player-up: whatever the player faces is up, at every zoom level', () => {
    for (let z = 0; z < MINIMAP.radii.length; z++) {
      for (const yaw of [0, 0.7, -2.1, Math.PI, 5.5]) {
        const v = view({ rotate: true, yaw, radius: zoomRadius(z) });
        // The player controller walks along (-sin yaw, -cos yaw).
        const ahead = worldToMinimap(v.cx - Math.sin(yaw) * v.radius, v.cz - Math.cos(yaw) * v.radius, v);
        near(ahead.x, 80, 1e-4);
        near(ahead.y, 0, 1e-4);
        // The right-hand side is (cos yaw, -sin yaw).
        const right = worldToMinimap(v.cx + Math.cos(yaw) * v.radius, v.cz - Math.sin(yaw) * v.radius, v);
        near(right.x, 160, 1e-4);
        near(right.y, 80, 1e-4);
      }
    }
  });

  it('agrees between modes when the player faces north', () => {
    const a = worldToMinimap(130, -90, view({ rotate: false, yaw: 0 }));
    const b = worldToMinimap(130, -90, view({ rotate: true, yaw: 0 }));
    near(a.x, b.x);
    near(a.y, b.y);
  });

  it('zooming out brings distant points inside the rim', () => {
    const far = { x: 100 + 200, z: -40 };
    expect(worldToMinimap(far.x, far.z, view({ radius: zoomRadius(0) })).r).toBeGreaterThan(1);
    expect(worldToMinimap(far.x, far.z, view({ radius: zoomRadius(2) })).r).toBeLessThan(1);
  });

  it('clamps an off-map waypoint to the rim and keeps its direction', () => {
    const v = view();
    const inside = clampToRim(worldToMinimap(v.cx + 30, v.cz + 10, v), v.size, 11);
    expect(inside.clamped).toBe(false);
    const raw = worldToMinimap(v.cx + 900, v.cz - 900, v);
    const rim = clampToRim(raw, v.size, 11);
    expect(rim.clamped).toBe(true);
    near(Math.hypot(rim.x - 80, rim.y - 80), 80 - 11, 1e-6);
    // Same bearing as the real point: up and to the right.
    near(Math.atan2(rim.y - 80, rim.x - 80), Math.atan2(raw.y - 80, raw.x - 80));
    near(rim.angle, -Math.PI / 4, 1e-6);
    // A point exactly on the limit is left alone.
    expect(clampToRim({ x: 80 + 69, y: 80, r: 69 / 80 }, 160, 11).clamped).toBe(false);
  });

  it('north marker and arrow: one turns in each mode', () => {
    const northUp = view({ rotate: false, yaw: 1 });
    expect(northMarker(northUp, 10)).toEqual({ x: 80, y: 10 });
    near(arrowRotation(northUp), headingRad(1));
    const playerUp = view({ rotate: true, yaw: -Math.PI / 2 }); // heading east
    expect(arrowRotation(playerUp)).toBe(0);
    const m = northMarker(playerUp, 10);
    // Facing east, north is to the left.
    near(m.x, 10, 1e-6);
    near(m.y, 80, 1e-6);
  });

  it('cycles three zoom levels', () => {
    expect([0, 1, 2].map(nextZoom)).toEqual([1, 2, 0]);
    expect(MINIMAP.radii).toHaveLength(3);
    expect(zoomRadius(0)).toBeLessThan(zoomRadius(1));
    expect(zoomRadius(1)).toBeLessThan(zoomRadius(2));
    expect(zoomRadius(99)).toBe(zoomRadius(2));
  });
});

describe('third-person boom', () => {
  it('takes the full length when nothing is in the way', () => {
    expect(resolveBoom(3.4, 0.6, () => true)).toBe(3.4);
  });
  it('shortens to the longest clear length and never passes an obstacle', () => {
    const d = resolveBoom(3.4, 0.6, (x) => x <= 2);
    expect(d).toBeLessThanOrEqual(2);
    expect(d).toBeGreaterThan(1.5);
  });
  it('returns 0 when even the shortest boom is blocked', () => {
    expect(resolveBoom(3.4, 0.6, () => false)).toBe(0);
  });
  it('eases the view switch without overshoot', () => {
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approach(0.9, 1, 0.3)).toBe(1);
    expect(approach(0.2, 0, 0.5)).toBe(0);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(2)).toBe(1);
  });
});

describe('hand-held items', () => {
  const tools: Tool[] = ['none', 'camera', 'video', 'binoculars', 'scanner', 'macro'];

  it('maps every tool to a prop (bare hands hold nothing)', () => {
    expect(TOOL_ITEM.none).toBeNull();
    for (const tool of tools) {
      if (tool === 'none') continue;
      expect(isHeldItem(TOOL_ITEM[tool]), tool).toBe(true);
    }
    expect(TOOL_ITEM.video).toBe(TOOL_ITEM.camera);
    expect(resolveHeldItem({ tool: 'scanner', overlay: 'none', flash: null, enabled: true })).toBe('scanner');
  });

  it('panels and actions take over the hand in the right order', () => {
    expect(resolveHeldItem({ tool: 'scanner', overlay: 'map', flash: 'specimen', enabled: true })).toBe('map');
    expect(resolveHeldItem({ tool: 'binoculars', overlay: 'journal', flash: null, enabled: true })).toBe('journal');
    expect(resolveHeldItem({ tool: 'scanner', overlay: 'reader', flash: 'specimen', enabled: true })).toBe('specimen');
    expect(resolveHeldItem({ tool: 'none', overlay: 'none', flash: 'journal', enabled: true })).toBe('journal');
    expect(resolveHeldItem({ tool: 'none', overlay: 'pause', flash: null, enabled: true })).toBeNull();
  });

  it('holds nothing when the setting is off', () => {
    for (const tool of tools) expect(resolveHeldItem({ tool, overlay: 'journal', flash: 'specimen', enabled: false })).toBeNull();
  });

  it('raises in about 0.2 s; a lens prop reaches the eye and hands over to the lens view', () => {
    const s: HeldState = { item: null, raise: 0, atEye: false };
    stepHeld(s, 'binoculars', 0.016);
    expect(s.item).toBe('binoculars');
    expect(s.atEye).toBe(false);
    for (let t = 0; t < RAISE_TIME + 0.05; t += 0.016) stepHeld(s, 'binoculars', 0.016);
    expect(s.raise).toBe(1);
    expect(s.atEye).toBe(true);
    // Lowering shows the prop again before it is put away.
    stepHeld(s, null, 0.016);
    expect(s.atEye).toBe(false);
    expect(s.raise).toBeLessThan(1);
    for (let t = 0; t < LOWER_TIME + 0.05; t += 0.016) stepHeld(s, null, 0.016);
    expect(s.item).toBeNull();
  });

  it('a hand tool is never "at the eye", and one item is lowered before the next comes up', () => {
    const s: HeldState = { item: null, raise: 0, atEye: false };
    for (let i = 0; i < 40; i++) stepHeld(s, 'scanner', 0.016);
    expect(s).toEqual({ item: 'scanner', raise: 1, atEye: false });
    stepHeld(s, 'journal', 0.016);
    expect(s.item).toBe('scanner');
    for (let i = 0; i < 12; i++) stepHeld(s, 'journal', 0.016);
    expect(s.item).toBe('journal');
    expect(s.raise).toBeLessThan(0.5);
  });

  it('poses: stowed items are out of frame, raised items rest in view', () => {
    const still = { time: 3, bob: 0, pace: 0, swayX: 0, swayY: 0 };
    for (const item of HELD_ITEMS) {
      const stowed = viewModelPose(item, 0, still);
      const up = viewModelPose(item, 1, still);
      expect(stowed.y, item).toBeLessThan(REST_POSE[item].y - STOW_DROP * 0.9);
      if (LENS_ITEMS.has(item)) {
        // At the eye: centred and close.
        expect(Math.abs(up.x), item).toBeLessThan(0.01);
        expect(up.z, item).toBeGreaterThan(-0.2);
      } else {
        expect(up.z, item).toBeCloseTo(REST_POSE[item].z, 5);
        expect(Math.abs(up.y - REST_POSE[item].y), item).toBeLessThan(0.01);
      }
    }
  });

  it('the scanner is held steady while standing still; other items breathe and everything bobs when walking', () => {
    const at = (time: number, pace = 0) => ({ time, bob: time * 6, pace, swayX: 0, swayY: 0 });
    expect(viewModelPose('scanner', 1, at(0.4))).toEqual(viewModelPose('scanner', 1, { ...at(2.9), bob: at(0.4).bob }));
    expect(viewModelPose('journal', 1, at(0.4)).y).not.toBe(viewModelPose('journal', 1, { ...at(1.2), bob: at(0.4).bob }).y);
    expect(viewModelPose('scanner', 1, at(0.4, 1)).y).not.toBe(viewModelPose('scanner', 1, at(0.7, 1)).y);
  });

  it('builds every prop as one small vertex-coloured geometry, simpler on the Low preset', () => {
    for (const item of HELD_ITEMS) {
      const full = buildProp(item, false);
      const simple = buildProp(item, true);
      const count = full.getAttribute('position').count;
      expect(count, item).toBeGreaterThan(30);
      expect(full.getAttribute('color').count, item).toBe(count);
      expect(simple.getAttribute('position').count, item).toBeLessThan(count);
      const box = full.boundingBox!;
      // Hand-sized: nothing larger than 35 cm.
      expect(Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z), item).toBeLessThan(0.35);
      expect(count, item).toBeLessThan(6000);
      full.dispose();
      simple.dispose();
    }
  });
});

describe('frame passes', () => {
  it('draws the view model over the world', () => {
    expect(planFrame(false, null)).toEqual(['world']);
    expect(planFrame(true, null)).toEqual(['world', 'viewmodel']);
  });

  it('never copies a frame that has the view model on it', () => {
    for (const viewModel of [false, true]) {
      for (const sized of [false, true]) {
        const plan = planFrame(viewModel, { sized, raw: false });
        expect(plan.filter((p) => p === 'copy')).toHaveLength(1);
        expect(copyIncludesViewModel(plan), JSON.stringify(plan)).toBe(false);
        // The pass just before the copy is always a world render.
        expect(plan[plan.indexOf('copy') - 1]).toBe('world');
        // The screen ends up as it started: view model back on top if it was showing.
        expect(plan[plan.length - 1]).toBe(viewModel ? 'viewmodel' : sized ? 'world' : 'copy');
      }
    }
  });

  it('a sized capture restores the renderer before the frame is shown again', () => {
    const plan = planFrame(true, { sized: true, raw: false });
    expect(plan).toEqual(['world', 'viewmodel', 'resize', 'world', 'copy', 'restore', 'world', 'viewmodel']);
  });

  it('only the debug raw capture can include the view model, and never at a custom size', () => {
    expect(copyIncludesViewModel(planFrame(true, { sized: false, raw: true }))).toBe(true);
    expect(copyIncludesViewModel(planFrame(false, { sized: false, raw: true }))).toBe(false);
    expect(copyIncludesViewModel(planFrame(true, { sized: true, raw: true }))).toBe(false);
  });
});

describe('HUD badges', () => {
  it('formats the clock', () => {
    expect(formatClock(7.5)).toBe('07:30');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(23.999)).toBe('00:00');
    expect(formatClock(17.6)).toBe('17:36');
    expect(formatClock(31.25)).toBe('07:15');
    expect(isDaytime(12)).toBe(true);
    expect(isDaytime(22)).toBe(false);
    expect(isDaytime(3)).toBe(false);
  });

  it('formats map coordinates as compass offsets', () => {
    expect(formatCoords(120.4, 44.6)).toBe('E 120 · S 45');
    expect(formatCoords(-3.2, -260)).toBe('W 3 · N 260');
  });

  it('shows context badges only while their condition holds, most urgent first', () => {
    const none = { recording: false, slowmo: 0, underwater: false, swimming: false, crouching: false, sprinting: false, waypointDistance: null };
    expect(contextBadges(none)).toEqual([]);
    expect(contextBadges({ ...none, recording: true, slowmo: 2, crouching: true, waypointDistance: 80 })).toEqual(['rec', 'slowmo', 'crouching', 'waypoint']);
    // Under water wins over swimming; crouch (the dive key) is not shown in water.
    expect(contextBadges({ ...none, underwater: true, swimming: true, crouching: true })).toEqual(['underwater']);
    expect(contextBadges({ ...none, swimming: true })).toEqual(['swimming']);
    expect(contextBadges({ ...none, sprinting: true })).toEqual(['sprinting']);
  });

  it('lights the right tool-bar entry', () => {
    expect(TOOLBAR.map((e) => e.key)).toEqual(['C', 'B', 'F', 'X', 'J', 'M']);
    expect(activeToolbarEntry('none', 'none')).toBeNull();
    expect(activeToolbarEntry('scanner', 'none')).toBe('scanner');
    expect(activeToolbarEntry('video', 'none')).toBe('camera');
    expect(activeToolbarEntry('scanner', 'journal')).toBe('journal');
    expect(activeToolbarEntry('none', 'map')).toBe('map');
  });
});

const rec = (speciesId: string, at: number): DiscoveryRecord => ({ speciesId, at, location: [0, 0, 0], biome: 'grassland', method: 'scan', scanned: true, bestQuality: 0, behaviors: [], viewed: false });
const photo = (id: string, timestamp: number, quality: number): PhotoMeta => ({ id, speciesId: null, timestamp, imageBlobId: id, quality, rating: 'good', location: [0, 0, 0], biome: 'grassland', width: 10, height: 10 });
const video = (id: string, timestamp: number): VideoMeta => ({ id, speciesId: 'rusa-unicolor', timestamp, blobId: id, mime: 'video/webm', seconds: 3, bytes: 10, location: [0, 0, 0], biome: 'grassland', behaviors: [], simScale: 1 });
const nothing: CollectionSource = { discovered: {}, photos: [], videos: [], artifacts: [], notes: [], landmarks: [], badges: [] };

describe('Quick View', () => {
  it('has a row for every collection, with fixed totals where the set is fixed', () => {
    const rows = quickViewRows(nothing, emptySeen());
    expect(rows.map((r) => r.kind)).toEqual([...COLLECTION_KINDS]);
    expect(COLLECTION_TOTALS.species).toBe(36);
    expect(COLLECTION_TOTALS.badges).toBe(5);
    expect(COLLECTION_TOTALS.photos).toBeNull();
    expect(COLLECTION_TOTALS.artifacts).toBeGreaterThan(0);
  });

  it('marks every collection empty when nothing has been found', () => {
    const rows = quickViewRows(nothing, emptySeen());
    for (const r of rows) expect(r, r.kind).toMatchObject({ count: 0, empty: true, recent: [], fresh: [] });
    expect(hasFreshItems(nothing, emptySeen())).toBe(false);
  });

  it('counts, and lists the most recent first, limited per row', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const s: CollectionSource = {
      ...nothing,
      // Stored out of order on purpose: order comes from the timestamps.
      discovered: Object.fromEntries([...ids].reverse().map((id) => [id, rec(id, ids.indexOf(id) * 10)])),
      photos: [photo('p2', 200, 71), photo('p1', 100, 88), photo('p4', 400, 40), photo('p3', 300, 55)],
      videos: [video('v1', 5), video('v2', 9)],
      artifacts: ['jar', 'bell'],
      landmarks: ['camp', 'ruins'],
      badges: ['first-researcher'],
    };
    const rows = Object.fromEntries(quickViewRows(s, emptySeen()).map((r) => [r.kind, r]));
    expect(rows.species).toMatchObject({ count: 7, total: 36, recent: ['g', 'f', 'e', 'd', 'c'], empty: false });
    expect(rows.species!.recent).toHaveLength(RECENT_LIMIT.species);
    expect(rows.photos).toMatchObject({ count: 4, recent: ['p4', 'p3', 'p2'] });
    expect(rows.videos).toMatchObject({ count: 2, recent: ['v2'] });
    expect(rows.artifacts).toMatchObject({ count: 2, recent: ['bell', 'jar'] });
    expect(rows.landmarks!.recent).toEqual(['ruins', 'camp']);
    expect(rows.badges).toMatchObject({ count: 1, total: 5 });
    expect(bestPhotoScore(s.photos)).toBe(88);
    expect(bestPhotoScore([])).toBeNull();
  });

  it('counts only written field notes, not signs or tracks that were read', () => {
    const s: CollectionSource = { ...nothing, notes: ['camp-board', 'note1', 'note3'] };
    expect(collectionIds(s).notes).toEqual(['note1', 'note3']);
  });

  it('marks what was collected since the panel last closed, and clears the mark on close', () => {
    const before: CollectionSource = { ...nothing, discovered: { a: rec('a', 1) }, photos: [photo('p1', 1, 50)] };
    const seen = snapshotSeen(before);
    expect(hasFreshItems(before, seen)).toBe(false);
    const after: CollectionSource = { ...before, discovered: { ...before.discovered, b: rec('b', 2), c: rec('c', 3) }, photos: [...before.photos, photo('p2', 2, 60)], badges: ['first-researcher'] };
    expect(hasFreshItems(after, seen)).toBe(true);
    const rows = Object.fromEntries(quickViewRows(after, seen).map((r) => [r.kind, r]));
    expect(rows.species!.fresh).toEqual(['c', 'b']);
    expect(rows.photos!.fresh).toEqual(['p2']);
    expect(rows.badges!.fresh).toEqual(['first-researcher']);
    expect(rows.videos!.fresh).toEqual([]);
    // Closing the panel takes a new snapshot.
    expect(hasFreshItems(after, snapshotSeen(after))).toBe(false);
  });

  it('store: opening does not clear the marks, closing does; a panel or a lens tool closes it', () => {
    const g = useGame.getState();
    g.startNew('biologist');
    g.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland');
    expect(hasFreshItems(useGame.getState(), useGame.getState().quickSeen)).toBe(true);
    g.setQuickView(true);
    expect(useGame.getState().quickView).toBe(true);
    expect(hasFreshItems(useGame.getState(), useGame.getState().quickSeen)).toBe(true);
    g.setQuickView(false);
    expect(hasFreshItems(useGame.getState(), useGame.getState().quickSeen)).toBe(false);
    g.setQuickView(true);
    g.setOverlay('journal');
    expect(useGame.getState().quickView).toBe(false);
    g.setOverlay('none');
    g.setQuickView(true);
    g.setTool('binoculars');
    expect(useGame.getState().quickView).toBe(false);
    g.setTool('none');
    // The scanner is held in the hand, not looked through.
    g.setQuickView(true);
    g.setTool('scanner');
    expect(useGame.getState().quickView).toBe(true);
    g.setQuickView(false);
    g.setTool('none');
  });

  it('is offered while walking but not through a lens or over a panel', () => {
    expect(quickViewAllowed('none', 'none')).toBe(true);
    expect(quickViewAllowed('scanner', 'none')).toBe(true);
    for (const tool of ['camera', 'video', 'binoculars', 'macro'] as const) expect(quickViewAllowed(tool, 'none'), tool).toBe(false);
    expect(quickViewAllowed('none', 'journal')).toBe(false);
    expect(quickViewAllowed('none', 'pause')).toBe(false);
  });

  it('a loaded save is not reported as new', () => {
    const g = useGame.getState();
    g.startNew('biologist');
    g.discover('rusa-unicolor', 'scan', [0, 0, 0], 'grassland');
    const save = useGame.getState().toSave();
    g.resetAll();
    useGame.getState().applySave(save);
    const s = useGame.getState();
    expect(Object.keys(s.discovered)).toEqual(['rusa-unicolor']);
    expect(hasFreshItems(s, s.quickSeen)).toBe(false);
  });
});

describe('settings migration', () => {
  it('gives settings saved by an older build the new defaults and keeps what they had', () => {
    const old = { language: 'en', quality: 'low', renderScale: 0.5, shadows: 'off', vegetation: 0.4, drawDistance: 'low', adaptive: false, showPerf: true, master: 0, music: 0.5, effects: 0.8, sensitivity: 1.4, invertY: true, dayMinutes: 0 };
    const s = normalizeSettings(old);
    expect(s).toMatchObject(old);
    expect(s).toMatchObject({ minimap: true, minimapMode: 'rotate', minimapSize: 'medium', minimapZoom: 1, heldItems: true, viewMode: 'first' });
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('keeps valid new values', () => {
    const s = normalizeSettings({ minimap: false, minimapMode: 'north', minimapSize: 'large', minimapZoom: 2, heldItems: false, viewMode: 'third' });
    expect(s).toMatchObject({ minimap: false, minimapMode: 'north', minimapSize: 'large', minimapZoom: 2, heldItems: false, viewMode: 'third' });
  });

  it('resets values that make no sense, and survives junk', () => {
    const s = normalizeSettings({ language: 'xx', quality: 'ultra', minimap: 'yes', minimapMode: 'spin', minimapSize: 'huge', minimapZoom: 7, heldItems: 1, viewMode: 'top' });
    expect(s).toEqual(DEFAULT_SETTINGS);
    for (const junk of [null, undefined, 42, 'x', []]) expect(normalizeSettings(junk)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ minimapZoom: 1.5 }).minimapZoom).toBe(DEFAULT_SETTINGS.minimapZoom);
    expect(normalizeSettings({ minimapZoom: -1 }).minimapZoom).toBe(DEFAULT_SETTINGS.minimapZoom);
  });

  it('store: V persists the view, N cycles the minimap zoom', () => {
    const g = useGame.getState();
    g.setViewMode('third');
    expect(useGame.getState().settings.viewMode).toBe('third');
    expect(useGame.getState().viewMode).toBe('third');
    // A new expedition keeps the view the player chose.
    g.startNew('biologist');
    expect(useGame.getState().viewMode).toBe('third');
    g.setViewMode('first');
    g.setSetting('minimapZoom', 0);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      useGame.getState().cycleMinimapZoom();
      seen.push(useGame.getState().settings.minimapZoom);
    }
    expect(seen).toEqual([1, 2, 0]);
    expect(useGame.getState().minimapZoomAt).toBeGreaterThan(0);
    g.setSetting('minimapZoom', DEFAULT_SETTINGS.minimapZoom);
  });
});
