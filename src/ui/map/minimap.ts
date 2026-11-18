/**
 * Minimap geometry (pure). The minimap is a square canvas showing a disc of
 * the reserve centred on the player, either north-up or turned so the player's
 * heading points up.
 */
import { MINIMAP } from '../../config';

export interface MinimapView {
  /** Player position (x east, z south). */
  cx: number;
  cz: number;
  /** Player yaw in radians, as stored in `runtime.player.yaw`. */
  yaw: number;
  /** Metres from the centre to the rim. */
  radius: number;
  /** Canvas side in pixels. */
  size: number;
  /** True: player-up (the map turns). False: north-up (the arrow turns). */
  rotate: boolean;
}

export interface MinimapPoint {
  x: number;
  y: number;
  /** Distance from the centre as a fraction of the radius (1 = on the rim). */
  r: number;
}

/** Compass heading in radians clockwise from north for a player yaw. */
export const headingRad = (yaw: number): number => -yaw;

/** World position -> minimap pixels (origin top-left). Points beyond the rim are returned unclamped. */
export function worldToMinimap(x: number, z: number, v: MinimapView): MinimapPoint {
  const scale = v.size / 2 / v.radius;
  let dx = (x - v.cx) * scale;
  let dy = (z - v.cz) * scale;
  if (v.rotate) {
    const h = headingRad(v.yaw);
    const c = Math.cos(h);
    const s = Math.sin(h);
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    dx = rx;
    dy = ry;
  }
  return { x: v.size / 2 + dx, y: v.size / 2 + dy, r: Math.hypot(dx, dy) / (v.size / 2) };
}

export interface RimPoint extends MinimapPoint {
  clamped: boolean;
  /** Direction from the centre in radians (0 = right, clockwise in screen space); used to turn the off-map marker. */
  angle: number;
}

/** Keeps a marker inside the disc: a point beyond `1 - margin` of the radius is pulled back onto that rim. */
export function clampToRim(p: MinimapPoint, size: number, marginPx: number): RimPoint {
  const half = size / 2;
  const dx = p.x - half;
  const dy = p.y - half;
  const d = Math.hypot(dx, dy);
  const limit = half - marginPx;
  const angle = Math.atan2(dy, dx);
  if (d <= limit || d === 0) return { ...p, clamped: false, angle };
  const k = limit / d;
  return { x: half + dx * k, y: half + dy * k, r: limit / half, clamped: true, angle };
}

/** Where the north marker sits on the rim. */
export function northMarker(v: MinimapView, marginPx: number): { x: number; y: number } {
  const half = v.size / 2;
  const h = v.rotate ? headingRad(v.yaw) : 0;
  return { x: half - Math.sin(h) * (half - marginPx), y: half - Math.cos(h) * (half - marginPx) };
}

/** Screen rotation of the player arrow in radians (0 = pointing up). */
export const arrowRotation = (v: MinimapView): number => (v.rotate ? 0 : headingRad(v.yaw));

export const ZOOM_COUNT = MINIMAP.radii.length;

export function nextZoom(index: number): number {
  return (((Math.round(index) + 1) % ZOOM_COUNT) + ZOOM_COUNT) % ZOOM_COUNT;
}

export function zoomRadius(index: number): number {
  return MINIMAP.radii[Math.max(0, Math.min(ZOOM_COUNT - 1, Math.round(index)))]!;
}
