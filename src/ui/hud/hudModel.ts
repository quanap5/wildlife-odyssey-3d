/** HUD badge model (pure): turns game state into the badges the HUD shows. */

/** 24-hour clock text for an in-game hour such as 7.5 -> "07:30". */
export function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Daylight hours are shown with a sun, the rest with a moon. */
export const isDaytime = (hour: number): boolean => {
  const h = ((hour % 24) + 24) % 24;
  return h >= 5.5 && h < 18.5;
};

export type ContextBadgeId = 'rec' | 'slowmo' | 'underwater' | 'swimming' | 'crouching' | 'sprinting' | 'waypoint';

export interface ContextInput {
  recording: boolean;
  /** Index into the slow-motion presets; 0 is normal speed. */
  slowmo: number;
  underwater: boolean;
  swimming: boolean;
  crouching: boolean;
  sprinting: boolean;
  /** Metres to the waypoint, or null without one. */
  waypointDistance: number | null;
}

/** Badges that appear only while their condition holds, in display order (most urgent first). */
export function contextBadges(c: ContextInput): ContextBadgeId[] {
  const out: ContextBadgeId[] = [];
  if (c.recording) out.push('rec');
  if (c.slowmo > 0) out.push('slowmo');
  if (c.underwater) out.push('underwater');
  else if (c.swimming) out.push('swimming');
  if (c.crouching && !c.swimming && !c.underwater) out.push('crouching');
  if (c.sprinting) out.push('sprinting');
  if (c.waypointDistance !== null) out.push('waypoint');
  return out;
}

/** "E 120 · S 45": signed map coordinates as compass offsets from the centre of the reserve (x east, z south). */
export function formatCoords(x: number, z: number): string {
  const ew = `${x >= 0 ? 'E' : 'W'} ${Math.abs(Math.round(x))}`;
  const ns = `${z >= 0 ? 'S' : 'N'} ${Math.abs(Math.round(z))}`;
  return `${ew} · ${ns}`;
}

export interface ToolbarEntry {
  id: 'camera' | 'binoculars' | 'scanner' | 'macro' | 'journal' | 'map';
  key: string;
}

/** Tools and panels offered on the bottom-left bar, with their keys. */
export const TOOLBAR: readonly ToolbarEntry[] = [
  { id: 'camera', key: 'C' },
  { id: 'binoculars', key: 'B' },
  { id: 'scanner', key: 'F' },
  { id: 'macro', key: 'X' },
  { id: 'journal', key: 'J' },
  { id: 'map', key: 'M' },
];

/** Which toolbar entry is lit for the current tool and open panel. */
export function activeToolbarEntry(tool: string, overlay: string): ToolbarEntry['id'] | null {
  if (overlay === 'journal') return 'journal';
  if (overlay === 'map') return 'map';
  if (tool === 'video') return 'camera';
  return TOOLBAR.some((e) => e.id === tool) ? (tool as ToolbarEntry['id']) : null;
}
