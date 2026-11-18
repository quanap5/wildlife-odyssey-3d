/** Optical-style zoom maths: zoom changes the projection, never the canvas size. */
import { clamp, degToRad, radToDeg } from '../../utils/math';

/** Vertical field of view (degrees) that magnifies the image `zoom` times. */
export function fovForZoom(baseFovDeg: number, zoom: number): number {
  const z = Math.max(1e-3, zoom);
  return radToDeg(2 * Math.atan(Math.tan(degToRad(baseFovDeg) / 2) / z));
}

/** Inverse of `fovForZoom`. */
export function zoomForFov(baseFovDeg: number, fovDeg: number): number {
  return Math.tan(degToRad(baseFovDeg) / 2) / Math.tan(degToRad(fovDeg) / 2);
}

/** Apparent diameter of a sphere as a fraction of the frame height (perspective projection). */
export function frameFraction(radius: number, distance: number, fovDeg: number): number {
  if (distance <= 0) return 1;
  return radius / distance / Math.tan(degToRad(fovDeg) / 2);
}

/** Multiplicative zoom step for the mouse wheel, clamped to the lens range. */
export function stepZoom(current: number, wheelDelta: number, min: number, max: number): number {
  return clamp(current * Math.pow(1.0015, -wheelDelta), min, max);
}

/** Next preset in a cycle (used by number keys / tap-to-cycle). */
export function nextPreset(presets: readonly number[], current: number): number {
  const i = presets.findIndex((p) => p > current + 1e-3);
  return i === -1 ? presets[0]! : presets[i]!;
}

/** 35 mm-equivalent focal length label for the viewfinder. */
export function focalLengthMm(fovDeg: number): number {
  return Math.round(12 / Math.tan(degToRad(fovDeg) / 2));
}
