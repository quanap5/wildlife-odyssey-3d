/**
 * Species identification by ray. Pure geometry (no Three.js scene access):
 * candidates are spheres, blockers are terrain, trunks, boulders and walls.
 * An entity hidden behind any of those is never identified.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TargetCandidate {
  id: string;
  kind: 'animal' | 'plant';
  speciesId: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export type Blocker =
  | { kind: 'cylinder'; x: number; z: number; y0: number; y1: number; r: number; owner?: string }
  | { kind: 'sphere'; x: number; y: number; z: number; r: number; owner?: string }
  | { kind: 'box'; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; owner?: string };

export interface PickOptions {
  maxDistance: number;
  /** Angular tolerance of the reticle (rad); shrinks with zoom. */
  tolerance: number;
}

export interface Pick {
  candidate: TargetCandidate;
  /** Distance along the view ray (m). */
  distance: number;
  /** Perpendicular miss distance (m). */
  miss: number;
}

/** Ranks candidates under the reticle: closest to the ray first, animals preferred. */
export function rankCandidates(origin: Vec3, dir: Vec3, candidates: readonly TargetCandidate[], opt: PickOptions): Pick[] {
  const out: (Pick & { score: number })[] = [];
  for (const c of candidates) {
    const vx = c.x - origin.x;
    const vy = c.y - origin.y;
    const vz = c.z - origin.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 0.25 || t > opt.maxDistance + c.radius) continue;
    const perp2 = Math.max(0, vx * vx + vy * vy + vz * vz - t * t);
    const allowed = c.radius + t * opt.tolerance;
    if (perp2 > allowed * allowed) continue;
    const miss = Math.sqrt(perp2);
    const score = (miss / allowed) * 0.6 + (t / opt.maxDistance) * 0.6 + (c.kind === 'animal' ? 0 : 0.35);
    out.push({ candidate: c, distance: t, miss, score });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

function segmentHitsCylinder(a: Vec3, b: Vec3, c: Extract<Blocker, { kind: 'cylinder' }>): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  const d2 = (px - c.x) ** 2 + (pz - c.z) ** 2;
  if (d2 > c.r * c.r) return false;
  const py = a.y + (b.y - a.y) * t;
  return py >= c.y0 && py <= c.y1;
}

function segmentHitsSphere(a: Vec3, b: Vec3, s: Extract<Blocker, { kind: 'sphere' }>): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const d2 = (a.x + dx * t - s.x) ** 2 + (a.y + dy * t - s.y) ** 2 + (a.z + dz * t - s.z) ** 2;
  return d2 < s.r * s.r;
}

function segmentHitsBox(a: Vec3, b: Vec3, box: Extract<Blocker, { kind: 'box' }>): boolean {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.y, b.y - a.y, box.minY, box.maxY],
    [a.z, b.z - a.z, box.minZ, box.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

export function segmentBlocked(a: Vec3, b: Vec3, blockers: readonly Blocker[], ignoreOwner?: string): boolean {
  for (const k of blockers) {
    if (ignoreOwner && k.owner === ignoreOwner) continue;
    if (k.kind === 'cylinder' ? segmentHitsCylinder(a, b, k) : k.kind === 'sphere' ? segmentHitsSphere(a, b, k) : segmentHitsBox(a, b, k)) return true;
  }
  return false;
}

/** Ray-marches the terrain between two points. */
export function terrainBlocked(a: Vec3, b: Vec3, heightAt: (x: number, z: number) => number, step = 1.2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(2, Math.ceil(len / step));
  // Skip the last few percent so a target standing on the ground is not self-occluded.
  for (let i = 1; i < n - 1; i++) {
    const t = i / n;
    if (a.y + dy * t < heightAt(a.x + dx * t, a.z + dz * t) - 0.02) return true;
  }
  return false;
}

/**
 * Fraction of the target that can be seen, 0..1. Five sample points (centre,
 * top, bottom, left, right) are tested against terrain and blockers.
 */
export function targetVisibility(
  origin: Vec3,
  c: TargetCandidate,
  blockers: readonly Blocker[],
  heightAt: (x: number, z: number) => number,
): number {
  const dx = c.x - origin.x;
  const dz = c.z - origin.z;
  const d = Math.hypot(dx, dz) || 1;
  // Horizontal axis perpendicular to the line of sight.
  const rx = -dz / d;
  const rz = dx / d;
  const r = c.radius * 0.55;
  const ground = heightAt(c.x, c.z);
  const samples: Vec3[] = [
    { x: c.x, y: c.y, z: c.z },
    { x: c.x, y: c.y + r, z: c.z },
    { x: c.x, y: Math.max(c.y - r, Math.min(c.y, ground + 0.03)), z: c.z },
    { x: c.x + rx * r, y: c.y, z: c.z + rz * r },
    { x: c.x - rx * r, y: c.y, z: c.z - rz * r },
  ];
  let seen = 0;
  for (const s of samples) {
    if (terrainBlocked(origin, s, heightAt)) continue;
    if (segmentBlocked(origin, s, blockers, c.id)) continue;
    seen++;
  }
  return seen / samples.length;
}

export interface PickResult extends Pick {
  visibility: number;
}

/** Full identification: the best-ranked candidate that is actually visible. */
export function pickTarget(
  origin: Vec3,
  dir: Vec3,
  candidates: readonly TargetCandidate[],
  blockers: readonly Blocker[],
  heightAt: (x: number, z: number) => number,
  opt: PickOptions,
  minVisibility = 0.4,
): PickResult | null {
  const ranked = rankCandidates(origin, dir, candidates, opt);
  for (let i = 0; i < Math.min(ranked.length, 4); i++) {
    const p = ranked[i]!;
    const visibility = targetVisibility(origin, p.candidate, blockers, heightAt);
    if (visibility >= minVisibility) return { ...p, visibility };
  }
  return null;
}
