import { describe, expect, it } from 'vitest';
import { focalLengthMm, fovForZoom, frameFraction, nextPreset, stepZoom, zoomForFov } from '../engine/camera/zoom';
import { nextAdaptiveScale } from '../engine/rendering/RenderLoop';
import { WEIGHTS, compositionScore, lightingScore, ratingFor, scorePhoto, sharpnessScore, sizeScore, type PhotoMetrics } from '../systems/photography/quality';
import { VIDEO_MIME_CANDIDATES, extensionFor, pickVideoMime } from '../systems/video/recorder';

const ideal: PhotoMetrics = { visibility: 1, frameFraction: 0.4, offCenter: 0.1, distance: 12, screenSpeed: 0, focus: 1, light: 0.85, exposure: 0 };

describe('photo quality scoring', () => {
  it('weights add up to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('gives a perfect shot 100 and stays within 0-100', () => {
    expect(scorePhoto(ideal).total).toBe(100);
    expect(scorePhoto(ideal).rating).toBe('excellent');
    const worst = scorePhoto({ visibility: 0, frameFraction: 0, offCenter: 2, distance: 500, screenSpeed: 9, focus: 0, light: 0, exposure: -2 });
    expect(worst.total).toBeGreaterThanOrEqual(0);
    expect(worst.total).toBeLessThan(15);
    expect(worst.rating).toBe('poor');
  });

  it('penalises each factor on its own', () => {
    const base = scorePhoto(ideal).total;
    const cases: Partial<PhotoMetrics>[] = [{ visibility: 0.6 }, { frameFraction: 0.05 }, { offCenter: 0.95 }, { distance: 120 }, { screenSpeed: 4 }, { focus: 0.2 }, { light: 0.1 }];
    for (const c of cases) expect(scorePhoto({ ...ideal, ...c }).total, JSON.stringify(c)).toBeLessThan(base);
  });

  it('halves the score of a mostly hidden subject', () => {
    const hidden = scorePhoto({ ...ideal, visibility: 0.2 });
    expect(hidden.total).toBeLessThan(60);
  });

  it('never rates a distant speck as good, however clean the rest of the shot is', () => {
    const speck = scorePhoto({ ...ideal, frameFraction: 0.04 });
    expect(speck.total).toBeLessThan(70);
    expect(['fair', 'poor']).toContain(speck.rating);
    // From about 13 % of frame height upwards only the size part itself is reduced.
    expect(scorePhoto({ ...ideal, frameFraction: 0.14 }).total).toBeGreaterThanOrEqual(90);
  });

  it('scores subject size: too small and too large are both worse', () => {
    expect(sizeScore(0)).toBe(0);
    expect(sizeScore(0.11)).toBeCloseTo(0.5);
    expect(sizeScore(0.4)).toBe(1);
    expect(sizeScore(1.4)).toBeLessThan(0.5);
  });

  it('scores composition, sharpness and lighting monotonically', () => {
    expect(compositionScore(0)).toBe(1);
    expect(compositionScore(0.7)).toBeLessThan(1);
    expect(compositionScore(1)).toBe(0);
    expect(sharpnessScore(0, 1)).toBe(1);
    expect(sharpnessScore(2, 1)).toBeGreaterThan(sharpnessScore(2, 0.1));
    expect(lightingScore(0.85, 0)).toBe(1);
    expect(lightingScore(0.2, 1)).toBeGreaterThan(lightingScore(0.2, 0));
  });

  it('maps totals to ratings', () => {
    expect(ratingFor(90)).toBe('excellent');
    expect(ratingFor(72)).toBe('good');
    expect(ratingFor(50)).toBe('fair');
    expect(ratingFor(20)).toBe('poor');
  });
});

describe('camera zoom', () => {
  it('leaves the field of view unchanged at 1x and narrows it when zooming', () => {
    expect(fovForZoom(62, 1)).toBeCloseTo(62);
    expect(fovForZoom(62, 2)).toBeLessThan(62);
    expect(fovForZoom(62, 8)).toBeLessThan(fovForZoom(62, 4));
  });

  it('magnifies by exactly the zoom factor (tangent relationship)', () => {
    for (const z of [2, 4, 8]) {
      const fov = fovForZoom(62, z);
      expect(Math.tan((31 * Math.PI) / 180) / Math.tan((fov * Math.PI) / 360)).toBeCloseTo(z, 6);
      expect(zoomForFov(62, fov)).toBeCloseTo(z, 6);
    }
  });

  it('grows the subject in frame as zoom increases', () => {
    const wide = frameFraction(0.8, 30, fovForZoom(62, 1));
    const tele = frameFraction(0.8, 30, fovForZoom(62, 8));
    expect(tele / wide).toBeGreaterThan(7.5);
    expect(tele / wide).toBeLessThan(8.5);
  });

  it('clamps wheel zoom and cycles presets', () => {
    expect(stepZoom(1, 1000, 1, 8)).toBe(1);
    expect(stepZoom(8, -1000, 1, 8)).toBe(8);
    expect(stepZoom(2, -200, 1, 8)).toBeGreaterThan(2);
    expect(nextPreset([1, 2, 4, 8], 2)).toBe(4);
    expect(nextPreset([1, 2, 4, 8], 8)).toBe(1);
    expect(focalLengthMm(fovForZoom(62, 8))).toBeGreaterThan(focalLengthMm(62) * 7);
  });
});

describe('video format selection', () => {
  it('prefers the first supported candidate', () => {
    expect(pickVideoMime(() => true)).toBe(VIDEO_MIME_CANDIDATES[0]);
    expect(pickVideoMime((m) => m.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1.42E01E');
  });

  it('returns null when nothing is supported, even if the probe throws', () => {
    expect(pickVideoMime(() => false)).toBeNull();
    expect(
      pickVideoMime(() => {
        throw new Error('boom');
      }),
    ).toBeNull();
  });

  it('derives the file extension from the container', () => {
    expect(extensionFor('video/webm;codecs=vp9')).toBe('webm');
    expect(extensionFor('video/mp4')).toBe('mp4');
  });
});

describe('adaptive render scale', () => {
  it('steps down when slow, back up when fast, and respects the limits', () => {
    expect(nextAdaptiveScale(1, 3.5, 0)).toBe(0.875);
    expect(nextAdaptiveScale(0.5, 10, 0)).toBe(0.5);
    expect(nextAdaptiveScale(0.75, 0, 12)).toBe(0.875);
    expect(nextAdaptiveScale(1, 0, 60)).toBe(1);
    expect(nextAdaptiveScale(1, 1, 1)).toBe(1);
  });
});
