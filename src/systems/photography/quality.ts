/** Photo quality scoring (0-100). Pure and deterministic. */
import { PHOTO } from '../../config';
import { clamp01 } from '../../utils/math';

export interface PhotoMetrics {
  /** Fraction of the subject that is unobstructed, 0..1. */
  visibility: number;
  /** Apparent subject diameter as a fraction of frame height. */
  frameFraction: number;
  /** Offset from frame centre as a fraction of half the frame height (0 centred). */
  offCenter: number;
  /** Distance to the subject (m). */
  distance: number;
  /** Subject + camera motion in frame-heights per second. */
  screenSpeed: number;
  /** Autofocus lock on the subject, 0..1. */
  focus: number;
  /** Scene light 0 (night) .. 1 (clear day). */
  light: number;
  /** Exposure compensation in stops; 0 is neutral. */
  exposure: number;
}

export interface PhotoScore {
  total: number;
  parts: {
    visibility: number;
    size: number;
    composition: number;
    distance: number;
    sharpness: number;
    focus: number;
    lighting: number;
  };
  rating: 'poor' | 'fair' | 'good' | 'excellent';
}

export const WEIGHTS = { visibility: 22, size: 20, composition: 14, distance: 8, sharpness: 12, focus: 12, lighting: 12 } as const;

/** Size score under which a subject counts as too small to carry the picture. */
export const SMALL_SUBJECT = 0.6;

/** Subject fills 22-70 % of the frame height = ideal. */
export function sizeScore(fraction: number): number {
  if (fraction <= 0) return 0;
  if (fraction < 0.22) return clamp01(fraction / 0.22);
  if (fraction <= 0.7) return 1;
  return clamp01(1 - (fraction - 0.7) / 0.9);
}

/** Centred or near a rule-of-thirds line scores best; edge of frame scores worst. */
export function compositionScore(offCenter: number): number {
  const o = Math.abs(offCenter);
  if (o <= 0.4) return 1;
  return clamp01(1 - (o - 0.4) / 0.6);
}

/** Longer effective shutter in dim light makes motion blur worse. */
export function sharpnessScore(screenSpeed: number, light: number): number {
  const shutter = 1 / 250 + (1 - clamp01(light)) * (1 / 12);
  const blur = Math.abs(screenSpeed) * shutter;
  return clamp01(1 - blur / 0.02);
}

export function lightingScore(light: number, exposure: number): number {
  // Exposure compensation can rescue dim scenes and ruins bright ones if overdone.
  const effective = clamp01(light) * Math.pow(2, exposure * 0.5);
  const ideal = 0.85;
  const dev = Math.abs(effective - ideal);
  return clamp01(1 - dev / 0.75);
}

export function ratingFor(total: number): PhotoScore['rating'] {
  if (total >= PHOTO.excellent) return 'excellent';
  if (total >= PHOTO.highQuality) return 'good';
  if (total >= 45) return 'fair';
  return 'poor';
}

export function scorePhoto(m: PhotoMetrics): PhotoScore {
  const parts = {
    visibility: clamp01(m.visibility),
    size: sizeScore(m.frameFraction),
    composition: compositionScore(m.offCenter),
    distance: clamp01(1 - (m.distance - 12) / 140),
    sharpness: sharpnessScore(m.screenSpeed, m.light),
    focus: clamp01(m.focus),
    lighting: lightingScore(m.light, m.exposure),
  };
  let total = 0;
  (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).forEach((k) => {
    total += WEIGHTS[k] * parts[k];
  });
  // A subject that is mostly hidden cannot make a good photograph.
  if (parts.visibility < 0.5) total *= 0.5 + parts.visibility;
  // Nor can a speck in the distance: below ~13 % of frame height the whole score is scaled down,
  // so a small animal has to be approached or zoomed in on before a photo rates as good.
  if (parts.size < SMALL_SUBJECT) total *= 0.6 + 0.4 * (parts.size / SMALL_SUBJECT);
  total = Math.round(Math.max(0, Math.min(100, total)));
  return { total, parts, rating: ratingFor(total) };
}
