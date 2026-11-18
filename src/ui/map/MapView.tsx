/**
 * Interactive reserve map: terrain and biomes drawn from the real world data,
 * fog over unexplored cells, landmarks, first-sighting markers, the player and
 * a clickable waypoint.
 */
import { useEffect, useMemo, useRef } from 'react';
import { WORLD } from '../../config';
import { BIOMES, BIOME_IDS } from '../../data/biomes/biomes';
import { getSpecies, speciesText } from '../../data/species';
import { useLang, useT, useTd } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { LANDMARKS } from '../../world/terrain/layout';
import { useTick } from '../useTick';
import { LANDMARK_ICON as ICON, getBaseMap } from './baseMap';
import { EXPLORE_CELLS, mapToWorld, worldToMap } from './coords';

const SIZE = 768;

export function MapView(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const ref = useRef<HTMLCanvasElement>(null);
  const explored = useGame((s) => s.explored);
  const landmarks = useGame((s) => s.landmarks);
  const discovered = useGame((s) => s.discovered);
  const waypoint = useGame((s) => s.waypoint);
  const setWaypoint = useGame((s) => s.setWaypoint);
  const notify = useGame((s) => s.notify);
  const focus = useGame((s) => s.mapFocus);
  const tick = useTick(250);
  const exploredSet = useMemo(() => new Set(explored), [explored]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(getBaseMap(), 0, 0, SIZE, SIZE);

    // Unexplored cells are veiled.
    const cell = SIZE / EXPLORE_CELLS;
    ctx.fillStyle = 'rgba(232, 224, 200, 0.82)';
    for (let j = 0; j < EXPLORE_CELLS; j++) {
      for (let i = 0; i < EXPLORE_CELLS; i++) {
        if (!exploredSet.has(j * EXPLORE_CELLS + i)) ctx.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }
    ctx.strokeStyle = 'rgba(60, 50, 30, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= EXPLORE_CELLS; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, SIZE);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(SIZE, i * cell);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const lm of LANDMARKS) {
      const known = landmarks.includes(lm.id);
      const p = worldToMap(lm.x, lm.z, SIZE);
      const seen = known || exploredSet.has(Math.floor(p.y / cell) * EXPLORE_CELLS + Math.floor(p.x / cell));
      if (!seen && lm.kind !== 'camp' && lm.kind !== 'station') continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = known ? '#fffaf0' : 'rgba(255,250,240,0.55)';
      ctx.fill();
      ctx.strokeStyle = known ? '#34513a' : '#8a8266';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = known ? '#1b2219' : '#6f6850';
      ctx.font = '13px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillText(known ? (ICON[lm.kind] ?? '•') : '?', p.x, p.y + 1);
      if (known) {
        ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,250,240,0.9)';
        const label = td(`landmark.${lm.id}`);
        ctx.strokeText(label, p.x, p.y + 22);
        ctx.fillStyle = '#1b2219';
        ctx.fillText(label, p.x, p.y + 22);
      }
    }

    // First sighting of each discovered species.
    for (const rec of Object.values(discovered)) {
      const p = worldToMap(rec.location[0], rec.location[2], SIZE);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#d99432';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (focus) {
      const p = worldToMap(focus[0], focus[1], SIZE);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#c2452d';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (waypoint) {
      const p = worldToMap(waypoint[0], waypoint[1], SIZE);
      ctx.fillStyle = '#c2452d';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 8, p.y - 20);
      ctx.arc(p.x, p.y - 20, 8, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 20, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow.
    const pp = worldToMap(runtime.player.pos.x, runtime.player.pos.z, SIZE);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(-runtime.player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#1e63b8';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [exploredSet, landmarks, discovered, waypoint, focus, tick, td]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    // The square map is letterboxed inside the element (object-fit: contain).
    const rect = e.currentTarget.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    const px = ((e.clientX - rect.left - (rect.width - side) / 2) / side) * SIZE;
    const py = ((e.clientY - rect.top - (rect.height - side) / 2) / side) * SIZE;
    if (px < 0 || py < 0 || px > SIZE || py > SIZE) return;
    if (waypoint) {
      const wp = worldToMap(waypoint[0], waypoint[1], SIZE);
      if (Math.hypot(wp.x - px, wp.y - 14 - py) < 16) {
        setWaypoint(null);
        return;
      }
    }
    const w = mapToWorld(px, py, SIZE);
    setWaypoint([Math.max(-WORLD.playLimit, Math.min(WORLD.playLimit, w.x)), Math.max(-WORLD.playLimit, Math.min(WORLD.playLimit, w.z))]);
    notify('map.waypointSet');
  };

  const sightings = Object.values(discovered)
    .slice(-6)
    .reverse()
    .map((r) => getSpecies(r.speciesId))
    .filter((s) => s !== undefined);

  return (
    <div className="map-wrap">
      <canvas ref={ref} className="map-canvas" width={SIZE} height={SIZE} onClick={onClick} data-testid="map-canvas" aria-label={t('map.title')} />
      <aside className="map-side">
        <b style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{t('map.title')}</b>
        <span className="muted">{t('map.hint')}</span>
        {waypoint && (
          <button type="button" className="btn ghost" onClick={() => setWaypoint(null)} data-testid="map-clear">
            {t('map.clear')}
          </button>
        )}
        <div className="cat-title">{t('map.legend')}</div>
        <ul className="legend">
          {BIOME_IDS.map((id) => (
            <li key={id}>
              <span className="swatch" style={{ background: BIOMES[id].mapColor }} />
              {td(`biome.${id}`)}
            </li>
          ))}
          <li>
            <span className="swatch" style={{ background: 'rgba(232,224,200,0.9)' }} />
            {t('map.unexplored')}
          </li>
          <li>
            <span className="swatch round" style={{ background: '#1e63b8' }} />
            {t('map.you')}
          </li>
          <li>
            <span className="swatch round" style={{ background: '#c2452d' }} />
            {t('map.waypoint')}
          </li>
          <li>
            <span className="swatch round" style={{ background: '#d99432' }} />
            {t('map.speciesMarker')}
          </li>
        </ul>
        {sightings.length > 0 && (
          <>
            <div className="cat-title">{t('map.speciesMarker')}</div>
            <span className="tiny muted">{sightings.map((s) => speciesText.name(s, lang)).join(' · ')}</span>
          </>
        )}
      </aside>
    </div>
  );
}
