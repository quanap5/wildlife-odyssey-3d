/**
 * Session orchestration: boot-time save detection, New / Continue / Reset,
 * autosave and save-on-exit. Storage failures are reported to the player.
 */
import { CAMP } from '../../config';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { getWorld } from '../../world/terrain/heightmap';
import { isRecording, stopRecording } from '../video/recorder';
import { getStorage } from './db';
import { loadSave, resetProgress, writeSave, type ResearchRole, type SaveData } from './save';

let cachedSave: SaveData | null = null;
let lastSavedDirty = -1;
let saving = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Reads storage once at start-up so the menu knows whether "Continue" exists. */
export async function bootSession(): Promise<void> {
  const storage = await getStorage();
  const result = await loadSave(storage).catch((e: unknown) => ({ status: 'corrupt' as const, error: String(e), backupKey: '' }));
  cachedSave = result.status === 'ok' ? result.data : null;
  useGame.getState().patch({
    storagePersistent: storage.persistent,
    savedAt: cachedSave?.savedAt ?? null,
    corruptSave: result.status === 'corrupt' ? result.error : null,
  });
}

export const hasSave = (): boolean => cachedSave !== null;

export async function saveNow(force = false): Promise<boolean> {
  const game = useGame.getState();
  if (game.screen !== 'playing' || saving) return false;
  if (!force && game.dirty === lastSavedDirty && runtime.player.speed < 0.05) return false;
  saving = true;
  try {
    const data = game.toSave();
    const storage = await getStorage();
    await writeSave(storage, data);
    cachedSave = data;
    lastSavedDirty = game.dirty;
    useGame.getState().patch({ savedAt: Date.now() });
    return true;
  } catch (err) {
    useGame.getState().notify('notify.saveFailed', { reason: err instanceof Error ? err.message : String(err) }, 'warn');
    return false;
  } finally {
    saving = false;
  }
}

function onHide(): void {
  if (document.visibilityState === 'hidden') void saveNow(true);
}

export function startAutosave(): void {
  if (timer) return;
  timer = setInterval(() => void saveNow(), 12000);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
}

export function stopAutosave(): void {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('pagehide', onHide);
}

export async function newGame(role: ResearchRole): Promise<void> {
  // A new expedition replaces the old one, including its stored media.
  const storage = await getStorage();
  await resetProgress(storage).catch(() => undefined);
  const x = CAMP.x + 3;
  const z = CAMP.z + 5;
  runtime.player.pos.set(x, getWorld().heightAt(x, z), z);
  runtime.player.vel.set(0, 0, 0);
  runtime.player.yaw = 2.214;
  runtime.player.pitch = 0;
  runtime.player.distanceWalked = 0;
  runtime.time.hour = 7.5;
  runtime.time.scale = 1;
  useGame.getState().startNew(role);
  lastSavedDirty = -1;
  await saveNow(true);
}

export function continueGame(): boolean {
  if (!cachedSave) return false;
  useGame.getState().applySave(cachedSave);
  lastSavedDirty = useGame.getState().dirty;
  return true;
}

export async function returnToMenu(): Promise<void> {
  if (isRecording()) await stopRecording();
  useGame.getState().setPendingVideo(null);
  await saveNow(true);
  runtime.time.scale = 1;
  useGame.getState().patch({ screen: 'menu', overlay: 'none', tool: 'none', slowmo: 0, prompt: null });
}

export async function resetAllProgress(): Promise<void> {
  const storage = await getStorage();
  await resetProgress(storage);
  cachedSave = null;
  useGame.getState().resetAll();
}
