/**
 * Procedural textures, painted once at start-up. Nothing is downloaded.
 *
 * - Foliage atlas: one RGBA sheet of 4 x 4 cells (leaf clusters, needles,
 *   fronds, grass, bark, rock ...). Every plant samples it through one shared
 *   material, so the whole of the vegetation still batches by geometry only.
 *   Cells are mostly greyscale: hue comes from vertex and instance colours.
 * - Ground set: two tiling sheets (soil/grass grain and rock strata) that the
 *   terrain shader samples in world space.
 *
 * `cellRect` is pure so geometry can be built without a DOM (unit tests).
 */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import { mulberry32 } from '../../utils/rng';

/* The four opaque cells share one quadrant so that coarse mip levels of a trunk never blend with transparent cells. */
const CELLS = [
  'solid', 'bark', 'broadleaf', 'needle',
  'rock', 'vein', 'spray', 'frond',
  'palm', 'grass', 'reed', 'wildflower',
  'weed', 'smallleaf', 'fur', 'scale',
] as const;
export type AtlasCell = (typeof CELLS)[number];

const GRID = 4;
const ATLAS = 1024;
const CELL = ATLAS / GRID;

/** UV rectangle [u0, v0, u1, v1] of a cell, inset so neighbours never bleed in. */
export function cellRect(cell: AtlasCell, inset = 5 / ATLAS): [number, number, number, number] {
  const i = CELLS.indexOf(cell);
  const cx = i % GRID;
  const cy = Math.floor(i / GRID);
  return [cx / GRID + inset, 1 - (cy + 1) / GRID + inset, (cx + 1) / GRID - inset, 1 - cy / GRID - inset];
}

/** Centre of the opaque white cell: geometry that wants plain vertex colour points here. */
export const SOLID_UV: [number, number] = [(cellRect('solid')[0] + cellRect('solid')[2]) / 2, (cellRect('solid')[1] + cellRect('solid')[3]) / 2];

type Ctx = CanvasRenderingContext2D;
const grey = (l: number, a = 1): string => `rgba(${Math.round(l)},${Math.round(l)},${Math.round(l)},${a})`;
/** Near-neutral leaf tone with a little hue drift so multiplied colours do not look flat. */
const leafTone = (r: () => number, lo = 0.7, hi = 1): string => {
  const l = (lo + r() * (hi - lo)) * 255;
  const warm = (r() - 0.5) * 26;
  return `rgb(${Math.round(Math.min(255, l + warm))},${Math.round(Math.min(255, l + 6))},${Math.round(Math.max(0, Math.min(255, l - warm - 8)))})`;
};

/** Pointed leaf from (0,0) along +y (canvas up is -y; callers rotate). */
function leafShape(ctx: Ctx, len: number, wid: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.75, 0, -len);
  ctx.bezierCurveTo(-wid * 0.8, -len * 0.75, -wid, -len * 0.25, 0, 0);
  ctx.closePath();
}

function drawLeaf(ctx: Ctx, x: number, y: number, ang: number, len: number, wid: number, fill: string, rib = true): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  leafShape(ctx, len, wid);
  ctx.fillStyle = fill;
  ctx.fill();
  if (rib) {
    ctx.strokeStyle = 'rgba(255,255,240,0.5)';
    ctx.lineWidth = Math.max(1, wid * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.04);
    ctx.lineTo(0, -len * 0.92);
    ctx.stroke();
    // One side in half-shadow gives each leaf a fold.
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.25, wid * 0.8, -len * 0.75, 0, -len);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

const painters: Record<AtlasCell, (ctx: Ctx, r: () => number) => void> = {
  solid(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CELL, CELL);
  },
  bark(ctx, r) {
    ctx.fillStyle = grey(196);
    ctx.fillRect(0, 0, CELL, CELL);
    // Vertical plates and fissures; drawn three times so the cell wraps horizontally.
    for (let i = 0; i < 46; i++) {
      const x = r() * CELL;
      const w = 2 + r() * 7;
      const dark = r() < 0.6;
      const y0 = -20 + r() * CELL;
      const h = 50 + r() * 190;
      const wob = (r() - 0.5) * 14;
      for (const off of [-CELL, 0, CELL]) {
        ctx.strokeStyle = dark ? grey(96 + r() * 50, 0.75) : grey(236, 0.5);
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + off, y0);
        ctx.bezierCurveTo(x + off + wob, y0 + h * 0.33, x + off - wob, y0 + h * 0.66, x + off + wob * 0.4, y0 + h);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = grey(110 + r() * 140, 0.35);
      ctx.fillRect(r() * CELL, r() * CELL, 1 + r() * 2, 2 + r() * 5);
    }
  },
  rock(ctx, r) {
    ctx.fillStyle = grey(200);
    ctx.fillRect(0, 0, CELL, CELL);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = grey(150 + r() * 100, 0.3);
      ctx.beginPath();
      ctx.ellipse(r() * CELL, r() * CELL, 8 + r() * 34, 5 + r() * 18, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      // Cracks.
      let x = r() * CELL;
      let y = r() * CELL;
      ctx.strokeStyle = grey(70 + r() * 40, 0.8);
      ctx.lineWidth = 1 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (r() - 0.5) * 46;
        y += (r() - 0.3) * 34;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = grey(120 + r() * 135, 0.4);
      ctx.fillRect(r() * CELL, r() * CELL, 1 + r() * 2, 1 + r() * 2);
    }
  },
  vein(ctx, r) {
    ctx.fillStyle = grey(232);
    ctx.fillRect(0, 0, CELL, CELL);
    const g = ctx.createLinearGradient(0, 0, CELL, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.16)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.strokeStyle = 'rgba(255,255,245,0.85)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(CELL / 2, 0);
    ctx.lineTo(CELL / 2, CELL);
    ctx.stroke();
    for (let i = 0; i < 11; i++) {
      const y = CELL - 10 - i * 22;
      for (const s of [-1, 1]) {
        ctx.strokeStyle = i % 2 ? 'rgba(255,255,245,0.55)' : 'rgba(40,50,30,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(CELL / 2, y);
        ctx.quadraticCurveTo(CELL / 2 + s * 60, y - 26, CELL / 2 + s * (118 + r() * 8), y - 62);
        ctx.stroke();
      }
    }
  },
  broadleaf(ctx, r) {
    const c = CELL / 2;
    // Back layer darker, front layer lighter: reads as a small bough of leaves.
    for (let layer = 0; layer < 3; layer++) {
      const n = layer === 0 ? 16 : 13;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * 78;
        const len = 46 + r() * 34;
        drawLeaf(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d * 0.9 + 8, a + Math.PI / 2 + (r() - 0.5) * 1.2, len, len * (0.2 + r() * 0.1), leafTone(r, 0.52 + layer * 0.15, 0.72 + layer * 0.14));
      }
    }
  },
  smallleaf(ctx, r) {
    const c = CELL / 2;
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 104;
        const len = 22 + r() * 16;
        drawLeaf(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, r() * Math.PI * 2, len, len * (0.26 + r() * 0.12), leafTone(r, 0.5 + layer * 0.16, 0.7 + layer * 0.15), layer > 0);
      }
    }
  },
  needle(ctx, r) {
    const c = CELL / 2;
    ctx.lineCap = 'round';
    for (let t = 0; t < 9; t++) {
      const a0 = r() * Math.PI * 2;
      const d0 = r() * 66;
      const x = c + Math.cos(a0) * d0;
      const y = c + Math.sin(a0) * d0;
      const dir = a0 + (r() - 0.5);
      for (let i = 0; i < 46; i++) {
        const a = dir + (r() - 0.5) * 2.5;
        const len = 30 + r() * 30;
        ctx.strokeStyle = leafTone(r, 0.5, 1);
        ctx.lineWidth = 2 + r() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 3, x + Math.cos(a) * len, y + Math.sin(a) * len + 7);
        ctx.stroke();
      }
    }
  },
  spray(ctx, r) {
    // Bamboo: thin arching twigs carrying lanceolate leaves.
    for (let t = 0; t < 4; t++) {
      const x0 = CELL * (0.3 + t * 0.14);
      const bend = (t - 1.5) * 44;
      ctx.strokeStyle = grey(190, 0.95);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x0, CELL);
      ctx.quadraticCurveTo(x0 + bend * 0.2, CELL * 0.5, x0 + bend, CELL * 0.1);
      ctx.stroke();
      for (let i = 0; i < 13; i++) {
        const k = 0.1 + (i / 13) * 0.86;
        const px = x0 + bend * k * k;
        const py = CELL - k * CELL * 0.9;
        const side = i % 2 ? 1 : -1;
        const len = 52 + r() * 26;
        drawLeaf(ctx, px, py, side * (1.0 + r() * 0.7) + (r() - 0.5) * 0.3, len, len * 0.12, leafTone(r, 0.6, 1));
      }
    }
  },
  frond(ctx, r) {
    // Pinnate fern frond growing up the cell.
    const cx = CELL / 2;
    ctx.strokeStyle = grey(170);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, CELL);
    ctx.lineTo(cx, 6);
    ctx.stroke();
    const pairs = 22;
    for (let i = 0; i < pairs; i++) {
      const k = i / (pairs - 1);
      const y = CELL - 14 - k * (CELL - 26);
      const len = Math.sin(Math.PI * Math.pow(0.08 + k * 0.92, 0.7)) * 112 + 6;
      for (const s of [-1, 1]) {
        drawLeaf(ctx, cx, y, s * (1.25 - k * 0.25), len, 6.5 + (1 - k) * 2.5, leafTone(r, 0.62, 1));
      }
    }
  },
  palm(ctx, r) {
    const cx = CELL / 2;
    ctx.strokeStyle = grey(180);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, CELL);
    ctx.lineTo(cx, 4);
    ctx.stroke();
    const pairs = 17;
    for (let i = 0; i < pairs; i++) {
      const k = i / (pairs - 1);
      const y = CELL - 8 - k * (CELL - 16);
      const len = 78 + Math.sin(Math.PI * (0.2 + k * 0.8)) * 44;
      for (const s of [-1, 1]) {
        drawLeaf(ctx, cx, y, s * (1.05 + (r() - 0.5) * 0.2 - k * 0.35), len, 5.5, leafTone(r, 0.62, 1));
      }
    }
  },
  grass(ctx, r) {
    for (let i = 0; i < 26; i++) {
      const x0 = CELL * (0.12 + r() * 0.76);
      const h = CELL * (0.45 + r() * 0.52);
      const lean = (r() - 0.5) * 120;
      const w = 5 + r() * 6;
      const g = ctx.createLinearGradient(0, CELL, 0, CELL - h);
      const top = 200 + r() * 55;
      g.addColorStop(0, grey(118));
      g.addColorStop(0.55, grey(top * 0.86));
      g.addColorStop(1, grey(top));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - w, CELL);
      ctx.quadraticCurveTo(x0 - w * 0.5 + lean * 0.25, CELL - h * 0.6, x0 + lean, CELL - h);
      ctx.quadraticCurveTo(x0 + w * 0.5 + lean * 0.25, CELL - h * 0.6, x0 + w, CELL);
      ctx.closePath();
      ctx.fill();
    }
  },
  reed(ctx, r) {
    for (let i = 0; i < 11; i++) {
      const x0 = CELL * (0.2 + r() * 0.6);
      const h = CELL * (0.6 + r() * 0.38);
      const lean = (r() - 0.5) * 70;
      const w = 4 + r() * 3.5;
      const g = ctx.createLinearGradient(0, CELL, 0, CELL - h);
      g.addColorStop(0, grey(130));
      g.addColorStop(1, grey(235));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - w, CELL);
      ctx.quadraticCurveTo(x0 + lean * 0.2, CELL - h * 0.6, x0 + lean, CELL - h);
      ctx.quadraticCurveTo(x0 + lean * 0.3, CELL - h * 0.6, x0 + w, CELL);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      // Seed heads: dark spikes on straight stalks.
      const x = CELL * (0.3 + i * 0.2 + r() * 0.06);
      const top = CELL * (0.12 + r() * 0.12);
      ctx.strokeStyle = grey(190);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, CELL);
      ctx.lineTo(x, top);
      ctx.stroke();
      ctx.fillStyle = 'rgb(118,84,56)';
      ctx.beginPath();
      ctx.roundRect(x - 6, top + 10, 12, 50, 6);
      ctx.fill();
    }
  },
  wildflower(ctx, r) {
    for (let i = 0; i < 9; i++) {
      const x0 = CELL * (0.16 + r() * 0.68);
      const h = CELL * (0.5 + r() * 0.42);
      const lean = (r() - 0.5) * 50;
      ctx.strokeStyle = 'rgb(120,150,90)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, CELL);
      ctx.quadraticCurveTo(x0 + lean * 0.3, CELL - h * 0.5, x0 + lean, CELL - h);
      ctx.stroke();
      drawLeaf(ctx, x0, CELL - 6, (r() - 0.5) * 1.4, 54, 7, 'rgb(128,160,96)', false);
      const fx = x0 + lean;
      const fy = CELL - h;
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(a) * 9, fy + Math.sin(a) * 9, 8.5, 5, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgb(255,214,96)';
      ctx.beginPath();
      ctx.arc(fx, fy, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  weed(ctx, r) {
    for (let i = 0; i < 9; i++) {
      const x0 = CELL * (0.18 + r() * 0.64);
      const h = CELL * (0.55 + r() * 0.43);
      const w = 7 + r() * 6;
      const sway = 18 + r() * 22;
      const ph = r() * 6;
      const g = ctx.createLinearGradient(0, CELL, 0, CELL - h);
      g.addColorStop(0, grey(120));
      g.addColorStop(1, grey(240));
      ctx.fillStyle = g;
      ctx.beginPath();
      const steps = 14;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        ctx.lineTo(x0 + Math.sin(t * 5 + ph) * sway * t - w * (1 - t * 0.8), CELL - t * h);
      }
      for (let k = steps; k >= 0; k--) {
        const t = k / steps;
        ctx.lineTo(x0 + Math.sin(t * 5 + ph) * sway * t + w * (1 - t * 0.8), CELL - t * h);
      }
      ctx.closePath();
      ctx.fill();
    }
  },
  fur(ctx, r) {
    // Opaque: short directional strokes, read as coat or plumage grain on animals.
    ctx.fillStyle = grey(214);
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * CELL;
      const y = r() * CELL;
      const len = 5 + r() * 9;
      ctx.strokeStyle = grey(150 + r() * 105, 0.5);
      ctx.lineWidth = 1 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y + len);
      ctx.stroke();
    }
  },
  scale(ctx, r) {
    // Opaque: overlapping scales for fish and reptiles.
    ctx.fillStyle = grey(206);
    ctx.fillRect(0, 0, CELL, CELL);
    const s = 16;
    for (let row = -1; row < CELL / (s * 0.62) + 1; row++) {
      for (let c = -1; c < CELL / s + 1; c++) {
        const x = c * s + (row % 2 ? s / 2 : 0);
        const y = row * s * 0.62;
        ctx.fillStyle = grey(196 + r() * 50);
        ctx.strokeStyle = grey(120, 0.6);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.58, 0, Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    }
  },
};

/** Canvas rows are top-down and premultiplied; GPU wants bottom-up straight alpha with colour under transparent texels. */
function toTexture(ctx: Ctx, size: number, repeat: boolean, fillRgb?: [number, number, number]): DataTexture {
  const src = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const s = (sy * size + x) * 4;
      const d = (y * size + x) * 4;
      const a = src[s + 3]!;
      if (fillRgb && a < 8) {
        // Without this, filtering pulls black into leaf edges.
        out[d] = fillRgb[0];
        out[d + 1] = fillRgb[1];
        out[d + 2] = fillRgb[2];
        out[d + 3] = 0;
      } else {
        out[d] = src[s]!;
        out[d + 1] = src[s + 1]!;
        out[d + 2] = src[s + 2]!;
        out[d + 3] = a;
      }
    }
  }
  const tex = new DataTexture(out, size, size, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 2;
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function canvas2d(size: number): Ctx | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c.getContext('2d', { willReadFrequently: true });
}

let atlas: Texture | null | undefined;

/** The shared foliage atlas, or null where there is no canvas (unit tests). */
export function getFoliageAtlas(): Texture | null {
  if (atlas !== undefined) return atlas;
  const ctx = canvas2d(ATLAS);
  if (!ctx) return (atlas = null);
  CELLS.forEach((name, i) => {
    ctx.save();
    ctx.translate((i % GRID) * CELL, Math.floor(i / GRID) * CELL);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    painters[name](ctx, mulberry32(1000 + i * 77));
    ctx.restore();
  });
  return (atlas = toTexture(ctx, ATLAS, false, [176, 196, 150]));
}

/* ---------- tiling ground sheets ---------- */

function lattice(period: number, seed: number): (x: number, y: number) => number {
  const r = mulberry32(seed);
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = v[y0 * period + x0]!;
    const b = v[y0 * period + x1]!;
    const c = v[y1 * period + x0]!;
    const d = v[y1 * period + x1]!;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

/** Tiling fractal noise in 0..1 over the unit square. */
function tilingFbm(basePeriod: number, octaves: number, seed: number): (u: number, v: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => ({ n: lattice(basePeriod << o, seed + o * 31), p: basePeriod << o, a: Math.pow(0.5, o) }));
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (u, v) => {
    let s = 0;
    for (const l of layers) s += l.n(u * l.p, v * l.p) * l.a;
    return s / norm;
  };
}

function sheet(size: number, fn: (u: number, v: number) => [number, number, number]): DataTexture {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x / size, y / size);
      const k = (y * size + x) * 4;
      out[k] = Math.max(0, Math.min(255, r * 255));
      out[k + 1] = Math.max(0, Math.min(255, g * 255));
      out[k + 2] = Math.max(0, Math.min(255, b * 255));
      out[k + 3] = 255;
    }
  }
  const tex = new DataTexture(out, size, size, RGBAFormat, UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export interface GroundTextures {
  /** R: clumpy mid-scale mottling. G: broad soft blotches. B: fine grain. Linear data, 0.5 = neutral. */
  detail: Texture;
  /** Rock strata and cracks (luminance in every channel, slight tint). */
  rock: Texture;
}

let ground: GroundTextures | undefined;

export function getGroundTextures(): GroundTextures {
  if (ground) return ground;
  const clump = tilingFbm(6, 5, 11);
  const blotch = tilingFbm(3, 3, 23);
  const grain = tilingFbm(48, 3, 37);
  const detail = sheet(512, (u, v) => {
    const c = clump(u, v);
    // Ridged term gives the clumps soft edges instead of plain blur.
    const ridged = 1 - Math.abs(clump(u + 0.37, v + 0.11) * 2 - 1);
    return [c * 0.65 + ridged * 0.35, blotch(u, v), grain(u, v)];
  });
  const warp = tilingFbm(4, 4, 51);
  const crack = tilingFbm(7, 4, 67);
  const speck = tilingFbm(64, 2, 71);
  const rock = sheet(512, (u, v) => {
    const w = warp(u, v);
    const strata = 0.5 + 0.5 * Math.sin((v * 22 + w * 5.5) * Math.PI);
    const cr = Math.pow(1 - Math.abs(crack(u, v) * 2 - 1), 7);
    const l = 0.5 + strata * 0.22 + (w - 0.5) * 0.4 + (speck(u, v) - 0.5) * 0.22 - cr * 0.45;
    return [l * 1.03, l, l * 0.95];
  });
  ground = { detail, rock };
  return ground;
}

export function disposeProceduralTextures(): void {
  atlas?.dispose();
  atlas = undefined;
  ground?.detail.dispose();
  ground?.rock.dispose();
  ground = undefined;
}
