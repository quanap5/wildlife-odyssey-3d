/**
 * Input manager. One set of DOM listeners (attached once, detached on dispose)
 * feeds continuous state (held keys, look deltas, wheel) that the frame loop
 * polls, and dispatches discrete key presses to subscribers.
 */

export type ActionHandler = (code: string, event: KeyboardEvent) => boolean | void;

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Space', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'KeyC', 'KeyB', 'KeyV', 'KeyM', 'KeyJ', 'KeyI',
  'KeyX', 'KeyZ', 'KeyT', 'KeyR', 'KeyO', 'KeyH', 'KeyG', 'F3', 'BracketLeft', 'BracketRight', 'Minus', 'Equal', 'Enter',
  'KeyN', 'KeyQ',
]);

/** Keys whose release matters: the equipment wheel (Tab) and Quick View (Q) show only while held. */
const HOLD_KEYS = new Set(['Tab', 'KeyQ']);

class InputManager {
  private readonly down = new Set<string>();
  private handlers = new Set<ActionHandler>();
  private attached = false;
  private canvas: HTMLElement | null = null;
  private dragging = false;
  private dragMoved = 0;
  /** Accumulated look deltas in pixels since the last poll. */
  lookX = 0;
  lookY = 0;
  wheel = 0;
  /** True when the pointer is captured. */
  locked = false;
  /** True once pointer lock has failed and drag-to-look is in use. */
  fallbackLook = false;
  /** When false, held keys are ignored (menus, journal). */
  enabled = true;
  onPrimary: (() => void) | null = null;
  onLockLost: (() => void) | null = null;
  private wantUnlock = false;
  /** True between requestLock() and releaseLock(): the game currently wants the cursor captured. */
  private lockWanted = false;

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  subscribe(handler: ActionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  consumeLook(): [number, number] {
    const out: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.code !== 'Escape') return;
    if (GAME_KEYS.has(e.code) && !(e.ctrlKey && e.code === 'KeyR')) e.preventDefault();
    const repeat = e.repeat;
    this.down.add(e.code);
    if (repeat) return;
    for (const h of this.handlers) if (h(e.code, e) === true) break;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    // Hold-to-show keys also report their release.
    if (HOLD_KEYS.has(e.code)) for (const h of this.handlers) h(`${e.code}:up`, e);
  };

  private readonly onBlur = (): void => {
    // A key released while the window is elsewhere never sends keyup: treat held keys as released.
    const blurEvent = new KeyboardEvent('keyup');
    for (const code of HOLD_KEYS) if (this.down.has(code)) for (const h of this.handlers) h(`${code}:up`, blurEvent);
    this.down.clear();
    this.dragging = false;
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (this.locked) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    } else if (this.dragging) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
      this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || e.target !== this.canvas) return;
    if (!this.locked) {
      this.dragging = true;
      this.dragMoved = 0;
      if (!this.fallbackLook) this.requestLock();
    } else {
      this.onPrimary?.();
    }
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.dragging) return;
    this.dragging = false;
    // In fallback mode a click without dragging is the primary action.
    if (!this.locked && this.fallbackLook && this.dragMoved < 5 && e.target === this.canvas) this.onPrimary?.();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (e.target !== this.canvas) return;
    e.preventDefault();
    this.wheel += e.deltaY;
  };

  private readonly onLockChange = (): void => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.dragging = false;
    // A lock request resolves asynchronously. If a panel was opened in the meantime the
    // lock is no longer wanted: give the cursor straight back so the panel can be clicked.
    if (this.locked && !this.lockWanted) {
      this.wantUnlock = true;
      document.exitPointerLock();
      return;
    }
    if (was && !this.locked) this.lockWanted = false;
    if (was && !this.locked && !this.wantUnlock) this.onLockLost?.();
    this.wantUnlock = false;
  };

  private readonly onLockError = (): void => {
    this.fallbackLook = true;
  };

  requestLock(): void {
    this.lockWanted = true;
    const el = this.canvas;
    if (!el || this.locked || !el.requestPointerLock) {
      if (el && !el.requestPointerLock) this.fallbackLook = true;
      return;
    }
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => (this.fallbackLook = true));
    } catch {
      this.fallbackLook = true;
    }
  }

  releaseLock(): void {
    this.lockWanted = false;
    if (this.locked) {
      this.wantUnlock = true;
      document.exitPointerLock();
    }
  }

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    this.down.clear();
    this.canvas = null;
  }
}

export const input = new InputManager();
