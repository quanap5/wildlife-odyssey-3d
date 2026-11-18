/** The reserve drawn once as a shaded relief image; the full map and the minimap both draw from it. */
import { WORLD } from '../../config';
import { BIOMES, BIOME_IDS } from '../../data/biomes/biomes';
import { getWorld } from '../../world/terrain/heightmap';

let baseMap: HTMLCanvasElement | null = null;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Shaded relief of the whole reserve, built once from the height grid. */
export function getBaseMap(): HTMLCanvasElement {
  if (baseMap) return baseMap;
  const world = getWorld();
  const n = WORLD.grid - 1;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  const colors = BIOME_IDS.map((id) => hexToRgb(BIOMES[id].mapColor));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = world.gridHeight(i, j);
      const k = (j * n + i) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (h < -0.05) {
        const d = Math.min(1, -h / 5);
        r = 96 - d * 44;
        g = 168 - d * 52;
        b = 200 - d * 40;
      } else {
        [r, g, b] = colors[world.biomes[j * WORLD.grid + i]!]!;
        // Hill-shading from the north-west plus a gentle altitude tint.
        const shade = (world.gridHeight(i - 1, j - 1) - world.gridHeight(i + 1, j + 1)) * 0.06;
        const lift = Math.min(0.25, h / 400);
        const f = 1 + Math.max(-0.35, Math.min(0.35, shade)) + lift;
        r *= f;
        g *= f;
        b *= f;
      }
      img.data[k] = Math.max(0, Math.min(255, r));
      img.data[k + 1] = Math.max(0, Math.min(255, g));
      img.data[k + 2] = Math.max(0, Math.min(255, b));
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  baseMap = c;
  return c;
}

/** Glyph per landmark kind, shared by the full map and the minimap. */
export const LANDMARK_ICON: Record<string, string> = { camp: '⛺', station: '⌂', viewpoint: '▲', ruins: '⟐', waterfall: '≋', cave: '◠', lake: '◌' };
