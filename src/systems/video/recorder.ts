/**
 * In-game video camera. Records the WebGL canvas with MediaRecorder
 * (canvas.captureStream), after checking which container/codec the browser
 * supports. Errors are surfaced to the player; nothing pretends to record.
 */
import { getSpecies } from '../../data/species';
import { audio } from '../../engine/audio/audio';
import { translate } from '../../i18n/translate';
import { useGame, type PendingVideo } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { getStorage, StorageError } from '../persistence/db';
import type { VideoMeta } from '../persistence/save';

export const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
] as const;

/** First supported recording format, or null. `isSupported` is injectable for tests. */
export function pickVideoMime(isSupported: (mime: string) => boolean): string | null {
  for (const m of VIDEO_MIME_CANDIDATES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export function recordingSupport(): { ok: true; mime: string } | { ok: false; reason: 'unsupported' | 'noCodec' } {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) {
    return { ok: false, reason: 'unsupported' };
  }
  const mime = pickVideoMime((m) => MediaRecorder.isTypeSupported(m));
  return mime ? { ok: true, mime } : { ok: false, reason: 'noCodec' };
}

export const extensionFor = (mime: string): string => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');

interface ActiveRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  mime: string;
  startedAt: number;
  simScale: number;
}

let active: ActiveRecording | null = null;

function cleanup(): void {
  if (active) for (const track of active.stream.getTracks()) track.stop();
  active = null;
  runtime.recording.active = false;
  useGame.getState().setRecording(false);
}

export function isRecording(): boolean {
  return active !== null;
}

export function startRecording(canvas: HTMLCanvasElement): boolean {
  if (active) return true;
  const game = useGame.getState();
  const support = recordingSupport();
  if (!support.ok) {
    game.notify(support.reason === 'unsupported' ? 'video.unsupported' : 'video.noCodec', undefined, 'warn');
    return false;
  }
  try {
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: 6_000_000 });
    const rec: ActiveRecording = { recorder, stream, chunks: [], mime: support.mime, startedAt: performance.now(), simScale: runtime.time.scale };
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) rec.chunks.push(e.data);
    };
    recorder.onerror = (e) => {
      const reason = (e as unknown as { error?: Error }).error?.message ?? 'recorder error';
      useGame.getState().notify('video.error', { reason }, 'warn');
      cleanup();
    };
    recorder.start(500);
    active = rec;
    runtime.recording.active = true;
    runtime.recording.startedAt = runtime.time.real;
    runtime.recording.species.clear();
    runtime.recording.behaviors.clear();
    game.setRecording(true);
    game.notify('video.start');
    audio.recordBeep(true);
    return true;
  } catch (err) {
    game.notify('video.error', { reason: err instanceof Error ? err.message : String(err) }, 'warn');
    cleanup();
    return false;
  }
}

/** Stops recording and opens the review screen. Resolves with the pending clip. */
export function stopRecording(): Promise<PendingVideo | null> {
  const rec = active;
  if (!rec) return Promise.resolve(null);
  return new Promise((resolve) => {
    const finish = (): void => {
      const seconds = (performance.now() - rec.startedAt) / 1000;
      // The subject is whichever species spent longest in the reticle.
      let speciesId: string | null = null;
      let best = 0.75;
      for (const [id, secs] of runtime.recording.species) {
        if (secs > best) {
          best = secs;
          speciesId = id;
        }
      }
      const behaviors = speciesId ? [...(runtime.recording.behaviors.get(speciesId) ?? [])] : [];
      const blob = new Blob(rec.chunks, { type: rec.mime.split(';')[0] });
      cleanup();
      audio.recordBeep(false);
      const game = useGame.getState();
      if (blob.size === 0 || seconds < 1) {
        game.notify('video.tooShort', undefined, 'warn');
        resolve(null);
        return;
      }
      const pending: PendingVideo = { blob, url: URL.createObjectURL(blob), mime: rec.mime, seconds, speciesId, behaviors, simScale: rec.simScale };
      game.setPendingVideo(pending);
      resolve(pending);
    };
    rec.recorder.onstop = finish;
    try {
      rec.recorder.stop();
    } catch {
      finish();
    }
  });
}

export function toggleRecording(canvas: HTMLCanvasElement): void {
  if (active) void stopRecording();
  else startRecording(canvas);
}

/** Saves the reviewed clip to the journal and credits the recorded behaviours. */
export async function savePendingVideo(): Promise<VideoMeta | null> {
  const game = useGame.getState();
  const pending = game.pendingVideo;
  if (!pending) return null;
  const lang = game.settings.language;
  try {
    const id = `video-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const storage = await getStorage();
    await storage.put('videos', id, pending.blob);
    const p = runtime.player;
    const meta: VideoMeta = {
      id,
      speciesId: pending.speciesId,
      timestamp: Date.now(),
      blobId: id,
      mime: pending.mime,
      seconds: Math.round(pending.seconds * 10) / 10,
      bytes: pending.blob.size,
      location: [p.pos.x, p.pos.y, p.pos.z],
      biome: p.biome,
      behaviors: pending.behaviors,
      simScale: pending.simScale,
    };
    game.addVideo(meta);
    if (pending.speciesId && getSpecies(pending.speciesId)) {
      for (const b of pending.behaviors) useGame.getState().recordBehavior(pending.speciesId, b, true);
    }
    useGame.getState().notify('video.saved', undefined, 'discovery');
    useGame.getState().setPendingVideo(null);
    return meta;
  } catch (err) {
    const reason = err instanceof StorageError && err.code === 'quota' ? translate(lang, 'video.quota') : err instanceof Error ? err.message : String(err);
    game.notify('video.saveFailed', { reason }, 'warn');
    return null;
  }
}

export async function loadVideo(id: string): Promise<Blob | null> {
  const storage = await getStorage();
  return (await storage.get<Blob>('videos', id)) ?? null;
}

export async function deleteVideo(id: string): Promise<void> {
  const storage = await getStorage();
  await storage.delete('videos', id);
  useGame.getState().removeVideo(id);
}
