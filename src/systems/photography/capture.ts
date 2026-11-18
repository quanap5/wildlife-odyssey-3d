/**
 * Photo capture pipeline: asks the render loop for the actual rendered pixels,
 * scores the shot from the live targeting data, stores the image in IndexedDB
 * and records the observation. Nothing here fakes a photograph.
 */
import { PHOTO } from '../../config';
import { getSpecies } from '../../data/species';
import { audio } from '../../engine/audio/audio';
import { translate } from '../../i18n/translate';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { getStorage, StorageError } from '../persistence/db';
import type { PhotoMeta } from '../persistence/save';
import { scorePhoto, type PhotoMetrics, type PhotoScore } from './quality';

export interface StoredPhoto {
  blob: Blob;
  thumb: Blob;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image encoding failed'))), type, quality);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function makeThumbnail(source: HTMLCanvasElement, width = 360): HTMLCanvasElement {
  const t = document.createElement('canvas');
  t.width = width;
  t.height = Math.max(1, Math.round((source.height / source.width) * width));
  t.getContext('2d')?.drawImage(source, 0, 0, t.width, t.height);
  return t;
}

/** Requests a frame from the render loop at the given size (0 = screen size). */
export function requestFrame(width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    if (runtime.capture) {
      reject(new Error('camera is busy'));
      return;
    }
    runtime.capture = { width, height, resolve, reject };
    // If the render loop is not running the request must not hang forever.
    setTimeout(() => {
      if (runtime.capture && runtime.capture.resolve === resolve) {
        runtime.capture = null;
        reject(new Error('renderer did not respond'));
      }
    }, 4000);
  });
}

/** Gathers the scoring inputs for the subject currently under the reticle. */
export function currentMetrics(): PhotoMetrics | null {
  const t = runtime.target;
  if (!t) return null;
  return {
    visibility: t.visibility,
    frameFraction: t.frameFraction,
    offCenter: t.offCenter,
    distance: t.distance,
    screenSpeed: t.screenSpeed,
    focus: runtime.focusLock,
    light: runtime.time.daylight,
    exposure: runtime.camera.exposure,
  };
}

let busy = false;

/** Takes a photograph. Returns the stored metadata, or null if it failed. */
export async function takePhoto(): Promise<PhotoMeta | null> {
  if (busy) return null;
  busy = true;
  const store = useGame.getState();
  const lang = store.settings.language;
  try {
    // Freeze the facts of the shot at the moment the shutter fires.
    const target = runtime.target;
    const metrics = currentMetrics();
    const score: PhotoScore | null = metrics ? scorePhoto(metrics) : null;
    const p = runtime.player;
    const res = PHOTO.resolutions[store.photoRes] ?? PHOTO.resolutions[0];
    audio.shutter();
    const frame = await requestFrame(res.w, res.h);
    const [blob, thumb] = await Promise.all([canvasToBlob(frame, 'image/jpeg', 0.92), canvasToBlob(makeThumbnail(frame), 'image/jpeg', 0.8)]);
    const id = `photo-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const storage = await getStorage();
    await storage.put('photos', id, { blob, thumb } satisfies StoredPhoto);

    const meta: PhotoMeta = {
      id,
      speciesId: target?.speciesId ?? null,
      timestamp: Date.now(),
      imageBlobId: id,
      quality: score?.total ?? 0,
      rating: score?.rating ?? 'none',
      location: [p.pos.x, p.pos.y, p.pos.z],
      biome: p.biome,
      observedBehavior: target?.behavior,
      width: frame.width,
      height: frame.height,
    };

    const game = useGame.getState();
    if (target && score) {
      const species = getSpecies(target.speciesId);
      const known = Boolean(game.discovered[target.speciesId]);
      if (!known && score.total >= PHOTO.identifyThreshold) {
        // A clear enough photograph identifies the species.
        game.discover(target.speciesId, 'photo', [target.x, target.y, target.z], p.biome);
        if (species) game.notify('cam.identified', { name: lang === 'vi' ? species.commonNameVi : species.commonNameEn }, 'discovery');
      } else if (!known) {
        game.notify('cam.tooPoor', undefined, 'warn');
      }
      useGame.getState().recordPhoto(meta, score);
      game.notify('cam.saved', { score: score.total, rating: translate(lang, `rating.${score.rating}`) });
    } else {
      game.recordPhoto(meta, null);
      game.notify('cam.savedNoSubject');
    }
    return meta;
  } catch (err) {
    const reason = err instanceof StorageError && err.code === 'quota' ? translate(lang, 'video.quota') : err instanceof Error ? err.message : String(err);
    useGame.getState().notify('cam.failed', { reason }, 'warn');
    return null;
  } finally {
    busy = false;
  }
}

export async function loadPhoto(id: string): Promise<StoredPhoto | null> {
  const storage = await getStorage();
  return (await storage.get<StoredPhoto>('photos', id)) ?? null;
}

export async function deletePhoto(id: string): Promise<void> {
  const storage = await getStorage();
  await storage.delete('photos', id);
  useGame.getState().removePhoto(id);
}

/** Triggers a browser download for a blob (may be blocked inside sandboxed embeds). */
/**
 * A page embedded in a sandboxed frame usually cannot start downloads, and the
 * browser gives no error when it refuses. Offer the button only at top level.
 */
export function downloadsAvailable(): boolean {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
