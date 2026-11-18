/**
 * Tiny procedural-modelling toolkit. Parts (primitives, optionally deformed) are
 * baked into one vertex-coloured BufferGeometry so a whole plant or animal body
 * renders in a single draw call and can be instanced.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { hash2, mulberry32 } from '../../utils/rng';
import { SOLID_UV, cellRect, type AtlasCell } from './proceduralTextures';

export type ColorFn = (p: Vector3, n: Vector3) => Color;
export type WindFn = (p: Vector3) => number;
export type DeformFn = (p: Vector3) => void;

export interface PartOptions {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  color: ColorRepresentation | ColorFn;
  /** Wind sway weight 0..1 (vegetation only). */
  wind?: number | WindFn;
  /** Applied in the primitive's local space before the transform. */
  deform?: DeformFn;
  /** Atlas cell the part's own UVs are mapped into. Without it the part is plain vertex colour. */
  cell?: AtlasCell;
  /** Repeats the part's UVs this many times inside the cell (coat and scale grain on animals). */
  tile?: number;
  /** Foliage shading: normals are never flipped for back faces and the part lets sunlight through. */
  soft?: boolean;
  /** Ground cover (grass, reeds): soft, and shrinks away beyond the grass draw distance. */
  ground?: boolean;
}

const _m = new Matrix4();
const _n = new Matrix3();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _nv = new Vector3();
const _s = new Vector3();
const _c = new Color();

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private wind: number[] = [];
  private uv: number[] = [];
  private soft: number[] = [];

  add(source: BufferGeometry, o: PartOptions): this {
    const geo = source.index ? source.toNonIndexed() : source;
    const p = geo.getAttribute('position');
    if (o.deform) {
      for (let i = 0; i < p.count; i++) {
        _p.fromBufferAttribute(p, i);
        o.deform(_p);
        p.setXYZ(i, _p.x, _p.y, _p.z);
      }
      geo.computeVertexNormals();
    }
    const nrm = geo.getAttribute('normal');
    const sc = o.scale ?? 1;
    if (typeof sc === 'number') _s.set(sc, sc, sc);
    else _s.set(sc[0], sc[1], sc[2]);
    // 'YXZ': tilt about x first, then yaw about y - the natural order for limbs and leaves.
    _e.set(o.rot?.[0] ?? 0, o.rot?.[1] ?? 0, o.rot?.[2] ?? 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(o.pos?.[0] ?? 0, o.pos?.[1] ?? 0, o.pos?.[2] ?? 0), _q, _s);
    _n.getNormalMatrix(_m);
    const fixed = typeof o.color === 'function' ? null : new Color(o.color);
    const uvs = o.cell ? geo.getAttribute('uv') : undefined;
    const rect = o.cell ? cellRect(o.cell) : null;
    const shade = geo.getAttribute('shade');
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i).applyMatrix4(_m);
      _nv.fromBufferAttribute(nrm, i).applyMatrix3(_n).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_nv.x, _nv.y, _nv.z);
      const c = fixed ?? (o.color as ColorFn)(_p, _nv);
      const k = shade ? shade.getX(i) : 1;
      this.col.push(c.r * k, c.g * k, c.b * k);
      if (rect && uvs) {
        let u = uvs.getX(i);
        let v = uvs.getY(i);
        if (o.tile) {
          // Wrap per triangle (the buffer is non-indexed) so no triangle spans the repeat.
          const t0 = i - (i % 3);
          const mu = Math.min(uvs.getX(t0), uvs.getX(t0 + 1), uvs.getX(t0 + 2)) * o.tile;
          const mv = Math.min(uvs.getY(t0), uvs.getY(t0 + 1), uvs.getY(t0 + 2)) * o.tile;
          u = u * o.tile - Math.floor(mu);
          v = v * o.tile - Math.floor(mv);
        }
        u = Math.min(1, Math.max(0, u));
        v = Math.min(1, Math.max(0, v));
        this.uv.push(rect[0] + (rect[2] - rect[0]) * u, rect[1] + (rect[3] - rect[1]) * v);
      } else {
        this.uv.push(SOLID_UV[0], SOLID_UV[1]);
      }
      this.soft.push(o.ground ? 2 : o.soft ? 1 : 0);
      this.wind.push(typeof o.wind === 'function' ? o.wind(_p) : (o.wind ?? 0));
    }
    if (geo !== source) geo.dispose();
    source.dispose();
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aWind', new BufferAttribute(new Float32Array(this.wind), 1));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aSoft', new BufferAttribute(new Float32Array(this.soft), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/* ---------- primitive helpers ---------- */

export const sphere = (r = 1, w = 10, h = 8): BufferGeometry => new SphereGeometry(r, w, h);

/** Tapered cylinder whose base sits at y = 0 and which grows along +y. */
export function limb(rBase: number, rTip: number, length: number, radial = 6, segments = 1): BufferGeometry {
  const g = new CylinderGeometry(rTip, rBase, length, radial, segments, false);
  g.translate(0, length / 2, 0);
  return g;
}

export function cone(r: number, length: number, radial = 6): BufferGeometry {
  const g = new ConeGeometry(r, length, radial);
  g.translate(0, length / 2, 0);
  return g;
}

/** Lumpy organic blob (tree crowns, shrubs, boulders). Deterministic per seed. */
export function blob(r: number, detail: number, seed: number, lumpiness = 0.28): BufferGeometry {
  const g = new IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    _p.fromBufferAttribute(p, i);
    // Hash on quantised direction so duplicated vertices move together.
    const d = _nv.copy(_p).normalize();
    const k =
      hash2(Math.round(d.x * 5) + seed, Math.round(d.y * 5) * 7 + Math.round(d.z * 5) * 13, seed) * 0.6 +
      hash2(Math.round(d.x * 11), Math.round(d.y * 11) * 5 + Math.round(d.z * 11) * 3, seed + 1) * 0.4;
    _p.multiplyScalar(1 + (k - 0.5) * 2 * lumpiness);
    p.setXYZ(i, _p.x, _p.y, _p.z);
  }
  // Blend faceted and spherical normals: soft foliage shading that still reads as volume.
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    _p.fromBufferAttribute(p, i).normalize();
    _nv.fromBufferAttribute(nrm, i).lerp(_p, 0.72).normalize();
    nrm.setXYZ(i, _nv.x, _nv.y, _nv.z);
  }
  return g;
}

/** Flat leaf/petal/fin: an ellipse-ish fan in the XZ plane pointing along +z from the origin. */
export function leaf(length: number, width: number, segments = 5, droop = 0, fold = 0): BufferGeometry {
  const pts: number[] = [];
  const row = (t: number): [number, number, number] => {
    const w = Math.sin(Math.PI * Math.pow(t, 0.75)) * width * 0.5;
    return [w, -droop * t * t * length, t * length];
  };
  for (let i = 0; i < segments; i++) {
    const a = row(i / segments);
    const b = row((i + 1) / segments);
    const ya = fold * a[0];
    const yb = fold * b[0];
    // centre spine at x = 0; left and right halves so the leaf can fold.
    pts.push(0, a[1], a[2], a[0], a[1] + ya, a[2], b[0], b[1] + yb, b[2]);
    pts.push(0, a[1], a[2], b[0], b[1] + yb, b[2], 0, b[1], b[2]);
    pts.push(0, a[1], a[2], -b[0], b[1] + yb, b[2], -a[0], a[1] + ya, a[2]);
    pts.push(0, a[1], a[2], 0, b[1], b[2], -b[0], b[1] + yb, b[2]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  const uv = new Float32Array((pts.length / 3) * 2);
  for (let i = 0; i < pts.length / 3; i++) {
    uv[i * 2] = pts[i * 3]! / Math.max(1e-6, width) + 0.5;
    uv[i * 2 + 1] = pts[i * 3 + 2]! / Math.max(1e-6, length);
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/* ---------- textured cards (leaf clusters, fronds, grass) ---------- */

const _a = new Vector3();
const _b = new Vector3();
const _cn = new Vector3();
const UP = new Vector3(0, 1, 0);

function cardGeometry(pos: number[], nor: number[], uv: number[], shade: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('shade', new BufferAttribute(new Float32Array(shade), 1));
  return g;
}

/**
 * A crown of leaf cards: `count` textured quads scattered through a lumpy ball.
 * Normals point outward from the crown centre (tilted up a little), so the
 * whole mass shades as one soft volume instead of as hundreds of flat panels.
 * `shade` darkens cards that sit deep or low in the crown (cheap ambient occlusion).
 */
export function foliage(radius: number, count: number, seed: number, card: number): BufferGeometry {
  const r = mulberry32(seed * 7919 + 13);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * 2.399963 + r() * 0.7;
    _p.set(Math.cos(phi) * ring, y, Math.sin(phi) * ring);
    const depth = 0.55 + r() * 0.5;
    const cx = _p.x * radius * depth;
    const cy = _p.y * radius * depth;
    const cz = _p.z * radius * depth;
    // Card plane: roughly facing outward, with enough scatter that no view lines them up.
    _cn.set(_p.x + (r() - 0.5) * 1.5, _p.y + (r() - 0.5) * 1.5, _p.z + (r() - 0.5) * 1.5).normalize();
    _a.crossVectors(_cn, Math.abs(_cn.y) > 0.9 ? _b.set(1, 0, 0) : UP).normalize();
    _b.crossVectors(_cn, _a);
    const roll = r() * Math.PI * 2;
    const half = (card * (0.75 + r() * 0.55)) / 2;
    const ax = (_a.x * Math.cos(roll) + _b.x * Math.sin(roll)) * half;
    const ay = (_a.y * Math.cos(roll) + _b.y * Math.sin(roll)) * half;
    const az = (_a.z * Math.cos(roll) + _b.z * Math.sin(roll)) * half;
    const bx = (_b.x * Math.cos(roll) - _a.x * Math.sin(roll)) * half;
    const by = (_b.y * Math.cos(roll) - _a.y * Math.sin(roll)) * half;
    const bz = (_b.z * Math.cos(roll) - _a.z * Math.sin(roll)) * half;
    _nv.set(_p.x * 0.8, _p.y * 0.8 + 0.5, _p.z * 0.8).normalize();
    const k = Math.min(1.12, 0.5 + 0.34 * Math.min(1, depth) + 0.2 * (_p.y * 0.5 + 0.5) + r() * 0.12);
    const corners: [number, number, number, number][] = [
      [-1, -1, 0, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 1],
      [-1, -1, 0, 0],
      [1, 1, 1, 1],
      [-1, 1, 0, 1],
    ];
    for (const [sa, sb, u, v] of corners) {
      pos.push(cx + ax * sa + bx * sb, cy + ay * sa + by * sb, cz + az * sa + bz * sb);
      nor.push(_nv.x, _nv.y, _nv.z);
      uv.push(u, v);
      shade.push(k);
    }
  }
  return cardGeometry(pos, nor, uv, shade);
}

/** A drooping textured strip along +z from the origin (palm and fern fronds). v runs base to tip. */
export function frond(length: number, width: number, segments = 4, droop = 0.3, cup = 0.1): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const shade: number[] = [];
  const row = (t: number): [number, number] => [-droop * t * t * length, t * length];
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const [y0, z0] = row(t0);
    const [y1, z1] = row(t1);
    const w = width / 2;
    const e = cup * w;
    // Normal of this segment (strip rises towards its edges when cupped).
    const ny = z1 - z0;
    const nz = -(y1 - y0);
    const nl = Math.hypot(ny, nz) || 1;
    const quad: [number, number, number, number, number][] = [
      [-w, y0 + e, z0, 0, t0],
      [w, y0 + e, z0, 1, t0],
      [w, y1 + e, z1, 1, t1],
      [-w, y0 + e, z0, 0, t0],
      [w, y1 + e, z1, 1, t1],
      [-w, y1 + e, z1, 0, t1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      nor.push(0, ny / nl, nz / nl);
      uv.push(u, v);
      shade.push(0.78 + 0.22 * v);
    }
  }
  return cardGeometry(pos, nor, uv, shade);
}

/** `n` upright quads crossing at the origin (grass tufts, reeds). Normals point up so the tuft takes the ground's light. */
export function crossCards(width: number, height: number, n = 2, lean = 0): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + 0.3;
    const dx = Math.cos(a) * (width / 2);
    const dz = Math.sin(a) * (width / 2);
    // Lean each card away from its own plane so the tuft has depth from above.
    const lx = -Math.sin(a) * lean * (i % 2 ? 1 : -1);
    const lz = Math.cos(a) * lean * (i % 2 ? 1 : -1);
    const quad: [number, number, number, number, number][] = [
      [-dx, 0, -dz, 0, 0],
      [dx, 0, dz, 1, 0],
      [dx + lx, height, dz + lz, 1, 1],
      [-dx, 0, -dz, 0, 0],
      [dx + lx, height, dz + lz, 1, 1],
      [-dx + lx, height, -dz + lz, 0, 1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push(u, v);
      shade.push(1);
    }
  }
  return cardGeometry(pos, nor, uv, shade);
}

/** One-triangle grass blade pointing along +z from the origin (cheapest possible leaf). */
export function blade(length: number, width: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-width / 2, 0, 0, width / 2, 0, 0, 0, 0, length]), 3));
  g.computeVertexNormals();
  return g;
}

export const col = (c: ColorRepresentation): Color => new Color(c);

/** Colour gradient along local height, with a little per-vertex variation. */
export function gradient(bottom: ColorRepresentation, top: ColorRepresentation, y0: number, y1: number, jitter = 0.06): ColorFn {
  const a = new Color(bottom);
  const b = new Color(top);
  return (p) => {
    const t = Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0)));
    const j = (hash2(Math.round(p.x * 37), Math.round(p.z * 37) + Math.round(p.y * 17)) - 0.5) * 2 * jitter;
    return _c.copy(a).lerp(b, t).offsetHSL(0, 0, j);
  };
}

/** Counter-shading used on animals: lighter belly, darker back. */
export function countershade(back: ColorRepresentation, belly: ColorRepresentation, sharpness = 2.2): ColorFn {
  const a = new Color(back);
  const b = new Color(belly);
  return (_pos, n) => {
    const t = Math.min(1, Math.max(0, 0.5 - n.y * sharpness * 0.5));
    return _c.copy(a).lerp(b, t * t);
  };
}
