/** Third-person camera boom (pure): how far back the camera may sit, and view-switch easing. */

/**
 * Longest clear boom length. `clearAt(d)` reports whether the camera can sit `d` metres
 * behind the head. Lengths are tried from `max` down to `min` in equal steps; 0 means
 * nothing was clear and the camera should stay at the head.
 */
export function resolveBoom(max: number, min: number, clearAt: (distance: number) => boolean, steps = 8): number {
  if (max <= 0) return 0;
  const lo = Math.min(min, max);
  for (let i = 0; i <= steps; i++) {
    const d = max - ((max - lo) * i) / steps;
    if (clearAt(d)) return d;
  }
  return 0;
}

/** Moves `current` towards `target` by at most `step`. */
export function approach(current: number, target: number, step: number): number {
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/** Smooth 0..1 easing for the view switch. */
export const easeInOut = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
