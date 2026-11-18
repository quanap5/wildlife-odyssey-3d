/**
 * Corner minimap. A 2D canvas drawn from the same relief image as the full
 * map (no extra 3D camera or render pass), redrawn at most ten times a second.
 */
import { useEffect, useMemo, useRef } from 'react';
import { MINIMAP, WORLD } from '../../config';
import { useT } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { LANDMARKS } from '../../world/terrain/layout';
import { LANDMARK_ICON, getBaseMap } from '../map/baseMap';
import { EXPLORE_CELLS } from '../map/coords';
import { arrowRotation, clampToRim, headingRad, northMarker, worldToMinimap, zoomRadius, type MinimapView } from '../map/minimap';
import { useTick } from '../useTick';

const ZOOM_LABEL = ['minimap.zoom.near', 'minimap.zoom.medium', 'minimap.zoom.far'] as const;

export function Minimap(): React.JSX.Element {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useGame((s) => s.settings.minimapMode);
  const sizeKey = useGame((s) => s.settings.minimapSize);
  const zoom = useGame((s) => s.settings.minimapZoom);
  const zoomAt = useGame((s) => s.minimapZoomAt);
  const explored = useGame((s) => s.explored);
  const landmarks = useGame((s) => s.landmarks);
  const waypoint = useGame((s) => s.waypoint);
  const exploredSet = useMemo(() => new Set(explored), [explored]);
  const tick = useTick(100);
  const size = MINIMAP.sizes[sizeKey];
  const radius = zoomRadius(zoom);
  const p = runtime.player;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const view: MinimapView = { cx: p.pos.x, cz: p.pos.z, yaw: p.yaw, radius, size, rotate: mode === 'rotate' };
    const half = size / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#20302a';
    ctx.fillRect(0, 0, size, size);

    // Terrain: the relief image, placed so the player sits at the centre.
    const base = getBaseMap();
    const basePerMetre = base.width / WORLD.size;
    const scale = half / radius / basePerMetre;
    ctx.save();
    ctx.translate(half, half);
    if (view.rotate) ctx.rotate(-headingRad(view.yaw));
    ctx.scale(scale, scale);
    ctx.translate(-(view.cx + WORLD.half) * basePerMetre, -(view.cz + WORLD.half) * basePerMetre);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, 0, 0);
    // Veil over cells not yet explored (only those that can be in view).
    const cell = base.width / EXPLORE_CELLS;
    const cellM = WORLD.size / EXPLORE_CELLS;
    const reach = radius * 1.45;
    const i0 = Math.max(0, Math.floor((view.cx - reach + WORLD.half) / cellM));
    const i1 = Math.min(EXPLORE_CELLS - 1, Math.floor((view.cx + reach + WORLD.half) / cellM));
    const j0 = Math.max(0, Math.floor((view.cz - reach + WORLD.half) / cellM));
    const j1 = Math.min(EXPLORE_CELLS - 1, Math.floor((view.cz + reach + WORLD.half) / cellM));
    ctx.fillStyle = 'rgba(22, 32, 27, 0.66)';
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!exploredSet.has(j * EXPLORE_CELLS + i)) ctx.fillRect(i * cell, j * cell, cell + 0.4, cell + 0.4);
      }
    }
    ctx.restore();

    // Landmarks the player has found (the camp and stations are always known).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const lm of LANDMARKS) {
      const known = landmarks.includes(lm.id);
      if (!known && lm.kind !== 'camp' && lm.kind !== 'station') continue;
      const pt = worldToMinimap(lm.x, lm.z, view);
      if (pt.r > 0.94) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = known ? '#fffaf0' : 'rgba(255, 250, 240, 0.6)';
      ctx.fill();
      ctx.strokeStyle = '#34513a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#1b2219';
      ctx.font = '10px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillText(LANDMARK_ICON[lm.kind] ?? '•', pt.x, pt.y + 0.5);
    }

    // Waypoint: on the map when in range, otherwise a pointer on the rim.
    if (waypoint) {
      const wp = clampToRim(worldToMinimap(waypoint[0], waypoint[1], view), size, 11);
      ctx.fillStyle = '#c2452d';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      if (wp.clamped) {
        ctx.save();
        ctx.translate(wp.x, wp.y);
        ctx.rotate(wp.angle);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Rim, north marker, player arrow.
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const north = northMarker(view, 10);
    ctx.beginPath();
    ctx.arc(north.x, north.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#10181299';
    ctx.fill();
    ctx.fillStyle = '#f0b65a';
    ctx.font = '600 10px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText('N', north.x, north.y + 0.5);
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(arrowRotation(view));
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#1e63b8';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // `p` is the live runtime object; the tick is what triggers a redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, size, radius, mode, exploredSet, landmarks, waypoint]);

  const showZoom = Date.now() - zoomAt < MINIMAP.zoomLabelMs;
  return (
    <div
      className="minimap"
      data-testid="minimap"
      data-zoom={zoom}
      data-radius={radius}
      data-mode={mode}
      data-px={p.pos.x.toFixed(1)}
      data-pz={p.pos.z.toFixed(1)}
      style={{ width: size, height: size }}
    >
      <canvas ref={ref} style={{ width: size, height: size }} aria-label={t('minimap.label')} />
      {showZoom && (
        <div className="minimap-zoom" data-testid="minimap-zoom">
          {t(ZOOM_LABEL[zoom] ?? 'minimap.zoom.medium')} · {radius} m
        </div>
      )}
    </div>
  );
}
