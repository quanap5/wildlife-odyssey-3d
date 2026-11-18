import { describe, expect, it } from 'vitest';
import { APERTURES, GRID_MODES } from '../config';
import { GeoBuilder, crossCards, foliage, frond, limb } from '../engine/rendering/geoBuilder';
import { SOLID_UV, cellRect, getFoliageAtlas, type AtlasCell } from '../engine/rendering/proceduralTextures';
import { getPlantGeometry } from '../world/vegetation/plantModels';

const CELLS: AtlasCell[] = ['solid', 'bark', 'broadleaf', 'needle', 'rock', 'vein', 'spray', 'frond', 'palm', 'grass', 'reed', 'wildflower', 'weed', 'smallleaf', 'fur', 'scale'];

describe('foliage atlas layout', () => {
  it('gives every cell its own rectangle inside the sheet', () => {
    const seen = new Set<string>();
    for (const c of CELLS) {
      const [u0, v0, u1, v1] = cellRect(c);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v0).toBeGreaterThanOrEqual(0);
      expect(u1).toBeLessThanOrEqual(1);
      expect(v1).toBeLessThanOrEqual(1);
      expect(u1 - u0).toBeCloseTo(0.25 - 10 / 1024, 5);
      expect(v1 - v0).toBeCloseTo(0.25 - 10 / 1024, 5);
      seen.add(`${Math.floor(u0 * 4)}:${Math.floor(v0 * 4)}`);
    }
    expect(seen.size).toBe(16);
  });

  it('keeps the opaque cells together in one quadrant so trunks never mip into transparent leaves', () => {
    for (const c of ['solid', 'bark', 'rock', 'vein'] as const) {
      const [u0, v0] = cellRect(c);
      expect(u0).toBeLessThan(0.5);
      expect(v0).toBeGreaterThanOrEqual(0.5);
    }
    const s = cellRect('solid');
    expect(SOLID_UV[0]).toBeGreaterThan(s[0]);
    expect(SOLID_UV[0]).toBeLessThan(s[2]);
  });

  it('does not need a canvas to build geometry', () => {
    expect(getFoliageAtlas()).toBeNull();
  });
});

describe('card geometry', () => {
  it('builds two triangles per leaf card with outward normals and a shade term', () => {
    const g = foliage(3, 40, 7, 1.5);
    expect(g.getAttribute('position').count).toBe(40 * 6);
    const n = g.getAttribute('normal');
    const p = g.getAttribute('position');
    let outward = 0;
    for (let i = 0; i < n.count; i += 6) {
      const dot = n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
      if (dot > -0.5) outward++;
    }
    expect(outward).toBeGreaterThan(30);
    const shade = g.getAttribute('shade');
    for (let i = 0; i < shade.count; i++) {
      expect(shade.getX(i)).toBeGreaterThan(0.4);
      expect(shade.getX(i)).toBeLessThanOrEqual(1.12);
    }
  });

  it('is deterministic for a seed', () => {
    const a = foliage(2, 12, 5, 1).getAttribute('position').array;
    const b = foliage(2, 12, 5, 1).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(foliage(2, 12, 6, 1).getAttribute('position').array)).not.toEqual(Array.from(a));
  });

  it('maps a part into its atlas cell and leaves untextured parts on the white cell', () => {
    const b = new GeoBuilder();
    b.add(frond(2, 1, 3, 0.2), { color: '#ffffff', cell: 'frond', soft: true });
    b.add(limb(0.2, 0.1, 2, 5), { color: '#886644' });
    b.add(crossCards(1, 0.5, 2), { color: '#ffffff', cell: 'grass', ground: true });
    const g = b.build();
    const uv = g.getAttribute('uv');
    const soft = g.getAttribute('aSoft');
    const fr = cellRect('frond');
    const frondVerts = 3 * 6;
    for (let i = 0; i < frondVerts; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(fr[0] - 1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(fr[2] + 1e-6);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(fr[1] - 1e-6);
      expect(uv.getY(i)).toBeLessThanOrEqual(fr[3] + 1e-6);
      expect(soft.getX(i)).toBe(1);
    }
    expect(uv.getX(frondVerts)).toBeCloseTo(SOLID_UV[0], 6);
    expect(soft.getX(frondVerts)).toBe(0);
    expect(soft.getX(g.getAttribute('position').count - 1)).toBe(2);
  });

  it('keeps tiled UVs inside the cell', () => {
    const b = new GeoBuilder();
    b.add(limb(0.3, 0.2, 2, 8, 2), { color: '#ffffff', cell: 'fur', tile: 3 });
    const g = b.build();
    const uv = g.getAttribute('uv');
    const r = cellRect('fur');
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(r[0] - 1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(r[2] + 1e-6);
    }
  });
});

describe('plant model variants', () => {
  it('builds leaf-card canopies by default and solid ones for the Low preset', () => {
    for (const id of ['dipterocarpus-alatus', 'ficus-religiosa', 'pinus-kesiya', 'bambusa-vulgaris']) {
      const cards = getPlantGeometry(id, false, false);
      const solid = getPlantGeometry(id, false, true);
      const softCards = Array.from(cards.getAttribute('aSoft').array).filter((v) => v > 0).length;
      const softSolid = Array.from(solid.getAttribute('aSoft').array).filter((v) => v > 0).length;
      expect(softCards, id).toBeGreaterThan(100);
      expect(softSolid, id).toBe(0);
      expect(cards).not.toBe(solid);
      // The far LOD is always lighter than the near one.
      expect(getPlantGeometry(id, true, false).getAttribute('position').count).toBeLessThan(cards.getAttribute('position').count);
    }
  });

  it('has ground cover for every decor kind, flagged to fade with distance', () => {
    for (const id of ['grass', 'reed', 'waterweed', 'wildflower']) {
      const g = getPlantGeometry(id);
      expect(g.getAttribute('position').count, id).toBeGreaterThanOrEqual(12);
      expect(Math.max(...Array.from(g.getAttribute('aSoft').array)), id).toBe(2);
      expect(Math.max(...Array.from(g.getAttribute('aWind').array)), id).toBeGreaterThan(0.3);
    }
    expect(Math.max(...Array.from(getPlantGeometry('grass', false, true).getAttribute('aSoft').array))).toBe(2);
  });
});

describe('camera settings', () => {
  it('offers apertures from wide to narrow and four guide modes', () => {
    expect([...APERTURES]).toEqual([...APERTURES].sort((a, b) => a - b));
    expect(APERTURES[0]).toBeLessThan(4);
    expect(APERTURES.at(-1)).toBeGreaterThan(8);
    expect(GRID_MODES).toEqual(['thirds', 'golden', 'diagonal', 'off']);
  });
});
