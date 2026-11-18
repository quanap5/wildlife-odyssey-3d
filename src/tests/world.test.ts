import { describe, expect, it } from 'vitest';
import { CAMP, WORLD } from '../config';
import { BIOME_IDS } from '../data/biomes/biomes';
import { EXPLORE_CELLS, bearingTo, cellsAround, exploreCellIndex, headingDelta, headingFromYaw, mapToWorld, worldToMap } from '../ui/map/coords';
import { chunkCoord, chunkKey, chunkKeyAt, chunkOrigin, chunksAround, diffChunkSets, terrainLodStep } from '../world/streaming/chunks';
import { WorldData, computeHeight, getWorld, lakeDistance, riverDistance } from '../world/terrain/heightmap';
import { FLATTEN_SPOTS, LAKE, LANDMARKS, POOL, RIVER_PATH, RUINS } from '../world/terrain/layout';
import { getChunkContent } from '../world/vegetation/placement';
import { PLANT_META } from '../world/vegetation/plantModels';
import { advanceHour, computeEnvironment, daylightFactor, nextWeather, sunDirection, WEATHER_TARGETS } from '../world/weather/environment';

const world = getWorld();

describe('terrain generation', () => {
  it('is deterministic: the same seed gives the same world', () => {
    const again = new WorldData();
    expect(again.heights.length).toBe(world.heights.length);
    for (let i = 0; i < world.heights.length; i += 997) expect(again.heights[i]).toBe(world.heights[i]);
    expect(computeHeight(123.4, -56.7)).toBe(computeHeight(123.4, -56.7));
  });

  it('contains all five biomes', () => {
    const seen = new Set<number>();
    for (const b of world.biomes) seen.add(b);
    expect(seen.size).toBe(BIOME_IDS.length);
  });

  it('places each named location in the right biome', () => {
    expect(world.biomeAt(CAMP.x, CAMP.z)).toBe('grassland');
    expect(world.biomeAt(RUINS.x, RUINS.z)).toBe('ruins');
    expect(world.biomeAt(-230, 100)).toBe('rainforest');
    expect(world.biomeAt(-70, -292)).toBe('mountain');
    expect(world.biomeAt(LAKE.x, LAKE.z)).toBe('freshwater');
  });

  it('carves water where the layout says and keeps the camp dry', () => {
    for (const [x, z] of RIVER_PATH) expect(world.isWater(x, z), `${x},${z}`).toBe(true);
    expect(world.waterDepthAt(LAKE.x, LAKE.z)).toBeGreaterThan(5);
    expect(world.waterDepthAt(POOL.x, POOL.z)).toBeGreaterThan(2.5);
    expect(world.heightAt(CAMP.x, CAMP.z)).toBeGreaterThan(1);
    expect(riverDistance(70, -190)).toBe(0);
    expect(lakeDistance(LAKE.x, LAKE.z)).toBe(0);
  });

  it('levels the ground under structures', () => {
    for (const s of FLATTEN_SPOTS) {
      const c = world.heightAt(s.x, s.z);
      for (const [dx, dz] of [[s.r * 0.6, 0], [0, s.r * 0.6], [-s.r * 0.6, 0], [0, -s.r * 0.6]] as const) {
        expect(Math.abs(world.heightAt(s.x + dx, s.z + dz) - c), `${s.x},${s.z}`).toBeLessThan(0.4);
      }
    }
  });

  it('has a mountain and a cliff behind the waterfall', () => {
    expect(world.maxHeight).toBeGreaterThan(70);
    expect(world.heightAt(70, -226)).toBeGreaterThan(18);
    expect(world.slopeAt(70, -214)).toBeGreaterThan(0.25);
  });

  it('interpolates between grid points and matches the grid on them', () => {
    expect(world.heightAt(-WORLD.half + 20, -WORLD.half + 40)).toBeCloseTo(world.gridHeight(10, 20), 5);
    const a = world.heightAt(10, 10);
    const b = world.heightAt(12, 10);
    const mid = world.heightAt(11, 10);
    expect(mid).toBeCloseTo((a + b) / 2, 5);
  });

  it('keeps landmarks inside the playable area', () => {
    for (const l of LANDMARKS) {
      expect(Math.abs(l.x)).toBeLessThan(WORLD.playLimit);
      expect(Math.abs(l.z)).toBeLessThan(WORLD.playLimit);
    }
  });
});

describe('chunk streaming', () => {
  it('maps positions to chunks and back', () => {
    expect(chunkCoord(-512)).toBe(0);
    expect(chunkCoord(511.9)).toBe(15);
    expect(chunkCoord(9999)).toBe(15);
    expect(chunkOrigin(8)).toBe(0);
    expect(chunkKeyAt(0.5, 0.5)).toBe(chunkKey(8, 8));
  });

  it('returns the rings around the player, nearest first, clipped to the world', () => {
    const centre = chunksAround(0, 0, 1);
    expect(centre.length).toBe(9);
    expect(centre[0]?.ring).toBe(0);
    expect(chunksAround(-510, -510, 1).length).toBe(4);
    expect(chunksAround(0, 0, 2).length).toBe(25);
  });

  it('chooses coarser terrain with distance', () => {
    expect(terrainLodStep(0)).toBe(1);
    expect(terrainLodStep(2)).toBe(2);
    expect(terrainLodStep(8)).toBe(4);
  });

  it('computes load and unload sets when the player moves', () => {
    const before = new Set(chunksAround(0, 0, 1).map((c) => c.key));
    const after = new Set(chunksAround(64, 0, 1).map((c) => c.key));
    const { load, unload } = diffChunkSets(before, after);
    expect(load.length).toBe(3);
    expect(unload.length).toBe(3);
    expect(diffChunkSets(before, before)).toEqual({ load: [], unload: [] });
  });
});

describe('vegetation placement', () => {
  it('is deterministic with stable ids', () => {
    const a = getChunkContent(3, 9);
    const b = getChunkContent(3, 9);
    expect(a).toBe(b);
    expect(a.trees.length).toBeGreaterThan(10);
    expect(new Set([...a.trees, ...a.plants].map((p) => p.id)).size).toBe(a.trees.length + a.plants.length);
  });

  it('grows forest trees in the forest and almost none in the meadow', () => {
    const forest = getChunkContent(chunkCoord(-260), chunkCoord(100));
    const meadow = getChunkContent(chunkCoord(40), chunkCoord(150));
    expect(forest.trees.length).toBeGreaterThan(meadow.trees.length * 4);
    expect(forest.trees.some((t) => t.speciesId === 'dipterocarpus-alatus')).toBe(true);
    expect(meadow.plants.some((p) => p.speciesId === 'imperata-cylindrica')).toBe(true);
  });

  it('keeps land plants out of the water and lotus in it', () => {
    for (const [cx, cz] of [[12, 11], [13, 11], [9, 8]] as const) {
      const c = getChunkContent(cx, cz);
      for (const p of [...c.trees, ...c.plants]) {
        const h = world.heightAt(p.x, p.z);
        if (p.speciesId === 'nelumbo-nucifera') {
          expect(h).toBeLessThan(-0.2);
          expect(p.y).toBe(WORLD.waterLevel);
        } else if (p.speciesId !== 'colocasia-esculenta') {
          expect(h, p.speciesId).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('plants the sacred figs at the ruins and nothing on the camp', () => {
    const ruins = getChunkContent(chunkCoord(-333), chunkCoord(312));
    expect(ruins.trees.some((t) => t.id.includes('feature') && t.speciesId === 'ficus-religiosa')).toBe(true);
    const camp = getChunkContent(chunkCoord(CAMP.x), chunkCoord(CAMP.z));
    for (const t of camp.trees) expect(Math.hypot(t.x - CAMP.x, t.z - CAMP.z)).toBeGreaterThan(16);
  });

  it('only places species that have model metadata', () => {
    const c = getChunkContent(5, 5);
    for (const p of [...c.trees, ...c.plants, ...c.rocks]) expect(PLANT_META[p.speciesId], p.speciesId).toBeDefined();
  });
});

describe('map coordinate conversion', () => {
  it('converts world to map and back', () => {
    expect(worldToMap(-512, -512, 768)).toEqual({ x: 0, y: 0 });
    expect(worldToMap(512, 512, 768)).toEqual({ x: 768, y: 768 });
    expect(worldToMap(0, 0, 768)).toEqual({ x: 384, y: 384 });
    for (const [x, z] of [[-200, 133], [77.5, -300.25], [0, 0]] as const) {
      const p = worldToMap(x, z, 512);
      const w = mapToWorld(p.x, p.y, 512);
      expect(w.x).toBeCloseTo(x, 6);
      expect(w.z).toBeCloseTo(z, 6);
    }
  });

  it('puts north at the top of the map', () => {
    expect(worldToMap(0, -400, 768).y).toBeLessThan(worldToMap(0, 400, 768).y);
    expect(worldToMap(400, 0, 768).x).toBeGreaterThan(worldToMap(-400, 0, 768).x);
  });

  it('indexes exploration cells and clamps at the edges', () => {
    expect(exploreCellIndex(-512, -512)).toBe(0);
    expect(exploreCellIndex(511, 511)).toBe(EXPLORE_CELLS * EXPLORE_CELLS - 1);
    expect(exploreCellIndex(99999, -99999)).toBe(EXPLORE_CELLS - 1);
    expect(cellsAround(0, 0, 1).length).toBe(9);
    expect(cellsAround(-512, -512, 1).length).toBe(4);
  });

  it('computes compass headings and bearings', () => {
    expect(headingFromYaw(0)).toBe(0);
    expect(headingFromYaw(-Math.PI / 2)).toBeCloseTo(90);
    expect(headingFromYaw(Math.PI / 2)).toBeCloseTo(270);
    expect(bearingTo(0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearingTo(0, 0, 10, 0)).toBeCloseTo(90);
    expect(bearingTo(0, 0, 0, 10)).toBeCloseTo(180);
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(10, 350)).toBe(-20);
  });
});

describe('day/night and weather model', () => {
  it('moves the sun from east to west and below the horizon at night', () => {
    expect(sunDirection(6)[0]).toBeGreaterThan(0.8);
    expect(sunDirection(12)[1]).toBeGreaterThan(0.9);
    expect(sunDirection(18)[0]).toBeLessThan(-0.8);
    expect(sunDirection(0)[1]).toBeLessThan(0);
  });

  it('is bright at noon, dark at midnight, and dimmer under cloud, rain and fog', () => {
    expect(daylightFactor(12)).toBe(1);
    expect(daylightFactor(0)).toBe(0);
    const clear = computeEnvironment(12, WEATHER_TARGETS.clear);
    const rain = computeEnvironment(12, WEATHER_TARGETS.rain);
    const fog = computeEnvironment(12, WEATHER_TARGETS.fog);
    const night = computeEnvironment(0, WEATHER_TARGETS.clear);
    expect(rain.lightLevel).toBeLessThan(clear.lightLevel);
    expect(fog.fogDensity).toBeGreaterThan(clear.fogDensity * 5);
    expect(night.sunIntensity).toBeLessThan(clear.sunIntensity * 0.2);
    expect(night.lightDir[1]).toBeGreaterThan(0);
  });

  it('advances and wraps the clock, and can be paused', () => {
    expect(advanceHour(23.5, 60, 24)).toBeCloseTo(0.5);
    expect(advanceHour(8, 3600, 0)).toBe(8);
    expect(advanceHour(8, 60, 6)).toBeCloseTo(12);
  });

  it('always changes to a different weather state', () => {
    for (const s of ['clear', 'cloudy', 'rain', 'fog'] as const) {
      for (const r of [0, 0.3, 0.7, 0.999]) expect(nextWeather(s, r)).not.toBe(s);
    }
  });
});
