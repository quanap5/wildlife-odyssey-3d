/**
 * Key bindings: maps discrete key presses and the primary click to game
 * actions. Continuous input (WASD, look, wheel) is polled by the player
 * controller instead.
 */
import { APERTURES, GRID_MODES, PHOTO, SLOWMO_PRESETS, ZOOM_PRESETS } from '../../config';
import { audio } from '../../engine/audio/audio';
import { input } from '../../engine/input/input';
import { useGame, type Overlay, type Tool } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { clamp } from '../../utils/math';
import { takePhoto } from '../photography/capture';
import { isRecording, stopRecording, toggleRecording } from '../video/recorder';
import { interact } from './Interaction';

export const TOOL_ORDER: Tool[] = ['camera', 'video', 'binoculars', 'scanner', 'macro', 'none'];
const BINOCULAR_PRESETS = [4, 6, 8, 12];

export function selectTool(tool: Tool): void {
  const st = useGame.getState();
  if (isRecording() && tool !== 'video') void stopRecording();
  st.setTool(tool);
  audio.ui();
}

function toggleOverlay(overlay: Overlay): void {
  const st = useGame.getState();
  if (st.overlay === overlay) closeOverlay();
  else {
    if (isRecording()) void stopRecording();
    st.setOverlay(overlay);
    audio.page();
    input.releaseLock();
  }
}

export function closeOverlay(): void {
  const st = useGame.getState();
  if (st.overlay === 'video') st.setPendingVideo(null);
  st.patch({ overlay: 'none', reader: null, inspect: null });
  if (!input.fallbackLook) input.requestLock();
}

export function setSlowmo(index: number): void {
  const i = ((index % SLOWMO_PRESETS.length) + SLOWMO_PRESETS.length) % SLOWMO_PRESETS.length;
  runtime.time.scale = SLOWMO_PRESETS[i]!;
  useGame.getState().patch({ slowmo: i });
}

/** Left click / Enter. */
export function primaryAction(canvas: HTMLCanvasElement | null): void {
  const st = useGame.getState();
  if (st.screen !== 'playing' || st.overlay !== 'none') return;
  if (st.tool === 'camera') void takePhoto();
  else if (st.tool === 'video' && canvas) toggleRecording(canvas);
  else if (st.tool === 'none' || st.tool === 'macro') interact();
}

/** Installs the bindings. Returns a disposer. */
export function installControls(getCanvas: () => HTMLCanvasElement | null): () => void {
  input.onPrimary = () => primaryAction(getCanvas());
  input.onLockLost = () => {
    const st = useGame.getState();
    if (st.screen === 'playing' && st.overlay === 'none') st.setOverlay('pause');
  };

  // Whatever opened a panel (a key, an interaction, the end of a recording), the cursor must be free.
  const unwatch = useGame.subscribe((s, prev) => {
    if ((s.overlay !== prev.overlay || s.screen !== prev.screen) && (s.overlay !== 'none' || s.screen !== 'playing')) input.releaseLock();
  });

  const unsubscribe = input.subscribe((code) => {
    const st = useGame.getState();
    if (st.screen !== 'playing') return;
    audio.start();
    const overlay = st.overlay;

    if (code === 'Escape') {
      if (overlay !== 'none') closeOverlay();
      else if (st.tool !== 'none') selectTool('none');
      else toggleOverlay('pause');
      return true;
    }
    if (code === 'F3') {
      st.setSetting('showPerf', !st.settings.showPerf);
      return true;
    }
    if (code === 'KeyJ') return toggleOverlay('journal'), true;
    if (code === 'KeyM') return toggleOverlay('map'), true;
    if (code === 'KeyI') return toggleOverlay('inventory'), true;
    if (code === 'Tab') {
      if (overlay === 'none') {
        st.setOverlay('wheel');
        input.releaseLock();
      }
      return true;
    }
    if (code === 'Tab:up') {
      if (overlay === 'wheel') closeOverlay();
      return true;
    }
    if (overlay === 'wheel' && code.startsWith('Digit')) {
      const tool = TOOL_ORDER[Number(code.slice(5)) - 1];
      if (tool) {
        selectTool(tool);
        closeOverlay();
      }
      return true;
    }
    if (overlay !== 'none') return;

    switch (code) {
      case 'KeyE':
        interact();
        return true;
      case 'KeyF':
        selectTool(st.tool === 'scanner' ? 'none' : 'scanner');
        return true;
      case 'KeyC':
        selectTool(st.tool === 'camera' || st.tool === 'video' ? 'none' : 'camera');
        return true;
      case 'KeyB':
        selectTool(st.tool === 'binoculars' ? 'none' : 'binoculars');
        return true;
      case 'KeyX':
        selectTool(st.tool === 'macro' ? 'none' : 'macro');
        return true;
      case 'KeyT':
        if (st.tool === 'camera') selectTool('video');
        else if (st.tool === 'video') selectTool('camera');
        return true;
      case 'KeyV': {
        const next = st.viewMode === 'first' ? 'third' : 'first';
        st.setViewMode(next);
        st.notify(next === 'first' ? 'notify.perspective.first' : 'notify.perspective.third');
        return true;
      }
      case 'KeyZ':
        setSlowmo(st.slowmo + 1);
        return true;
      case 'KeyH':
        if (st.tool !== 'none') st.patch({ hudHidden: !st.hudHidden });
        return true;
      case 'KeyR':
        if (st.tool === 'camera') st.patch({ photoRes: (st.photoRes + 1) % PHOTO.resolutions.length });
        return true;
      case 'KeyO':
        if (st.tool === 'camera' || st.tool === 'video') st.patch({ dof: !st.dof });
        return true;
      case 'KeyG':
        if (st.tool === 'camera' || st.tool === 'video') st.patch({ grid: (st.grid + 1) % GRID_MODES.length });
        return true;
      case 'Minus':
        // Wider aperture: shallower depth of field.
        if (st.tool === 'camera' || st.tool === 'video') st.patch({ aperture: Math.max(0, st.aperture - 1) });
        return true;
      case 'Equal':
        if (st.tool === 'camera' || st.tool === 'video') st.patch({ aperture: Math.min(APERTURES.length - 1, st.aperture + 1) });
        return true;
      case 'BracketLeft':
        runtime.camera.exposure = clamp(runtime.camera.exposure - 1 / 3, -2, 2);
        return true;
      case 'BracketRight':
        runtime.camera.exposure = clamp(runtime.camera.exposure + 1 / 3, -2, 2);
        return true;
      case 'Enter':
        primaryAction(getCanvas());
        return true;
      default:
        break;
    }
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5)) - 1;
      if (st.tool === 'camera' || st.tool === 'video') {
        const z = ZOOM_PRESETS[n];
        if (z) runtime.camera.targetZoom = z;
      } else if (st.tool === 'binoculars') {
        const z = BINOCULAR_PRESETS[n];
        if (z) runtime.camera.targetZoom = z;
      }
      return true;
    }
    return;
  });

  return () => {
    unsubscribe();
    unwatch();
    input.onPrimary = null;
    input.onLockLost = null;
  };
}
