export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth Hermite step of an already-normalised value. */
export const smooth01 = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

export const smoothstep = (e0: number, e1: number, x: number): number => smooth01((x - e0) / (e1 - e0));

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const wrapAngle = (a: number): number => {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};

export const dampAngle = (current: number, target: number, rate: number, dt: number): number =>
  current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

/** Distance from point P to segment AB in 2D. */
export function pointSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? clamp01(((px - ax) * abx + (pz - az) * abz) / len2) : 0;
  return dist2(px, pz, ax + abx * t, az + abz * t);
}

export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;
