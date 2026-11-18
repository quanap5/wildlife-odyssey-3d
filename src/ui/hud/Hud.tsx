/** Minimal in-game HUD: compass, biome, objective tracker, tool, prompts, notices. */
import { useEffect } from 'react';
import { SLOWMO_PRESETS } from '../../config';
import { getSpecies, speciesText } from '../../data/species';
import { input } from '../../engine/input/input';
import { useLang, useT, useTd } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { activeQuest, getProgress, objectiveDone } from '../../systems/quests/engine';
import { bearingTo, headingDelta, headingFromYaw } from '../map/coords';
import { getThumbnail } from '../journal/modelPreview';
import { useTick } from '../useTick';

const PX_PER_DEG = 3.2;
const MARKS: [number, string, boolean][] = [];
for (let d = 0; d < 360; d += 15) {
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  MARKS.push([d, names[d] ?? String(d), d % 90 === 0]);
}

function Compass(): React.JSX.Element {
  const waypoint = useGame((s) => s.waypoint);
  const heading = headingFromYaw(runtime.player.yaw);
  const p = runtime.player.pos;
  const wpDelta = waypoint ? headingDelta(heading, bearingTo(p.x, p.z, waypoint[0], waypoint[1])) : null;
  return (
    <div className="compass glass" data-testid="compass" data-heading={heading.toFixed(1)}>
      <div className="compass-strip">
        {MARKS.map(([deg, label, major]) => {
          const delta = headingDelta(heading, deg);
          if (Math.abs(delta) > 75) return null;
          return (
            <span key={deg} className={`compass-tick ${major ? 'major' : ''}`} style={{ left: delta * PX_PER_DEG }}>
              {label}
            </span>
          );
        })}
        {wpDelta !== null && (
          <span className="compass-wp" style={{ left: Math.max(-62, Math.min(62, wpDelta)) * PX_PER_DEG }}>
            ◆
          </span>
        )}
      </div>
      <div className="compass-needle" />
    </div>
  );
}

function Tracker(): React.JSX.Element {
  const t = useT();
  const quest = useGame((s) => s.quest);
  const q = activeQuest(quest);
  if (!q) {
    return (
      <div className="tracker glass" data-testid="tracker">
        <div className="label">{t('hud.objective')}</div>
        <h4>{t('hud.freeRoam')}</h4>
      </div>
    );
  }
  return (
    <div className="tracker glass" data-testid="tracker" data-quest={q.id}>
      <div className="label">{t('hud.objective')}</div>
      <h4>{t(q.title)}</h4>
      <ul>
        {q.objectives.map((o) => {
          const done = objectiveDone(o, q, quest);
          const prog = getProgress(quest, q.id, o.id);
          return (
            <li key={o.id} className={done ? 'done' : ''} data-objective={o.id} data-done={done}>
              {t(o.text)}
              {!done && o.kind === 'event' && o.count > 1 && (
                <span className="count">
                  {Math.min(o.count, Math.floor(prog.count))}/{o.count}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Notices(): React.JSX.Element {
  const notices = useGame((s) => s.notices);
  const expire = useGame((s) => s.expireNotices);
  useEffect(() => {
    const id = setInterval(() => expire(Date.now()), 500);
    return () => clearInterval(id);
  }, [expire]);
  return (
    <div className="notices" aria-live="polite" data-testid="notices">
      {notices.map((n) => (
        <div key={n.id} className={`notice glass ${n.kind}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

/** First-sighting card: portrait, both names and how the species was identified. */
function DiscoveryCard(): React.JSX.Element | null {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const card = useGame((s) => s.discoveryCard);
  const patch = useGame((s) => s.patch);
  useEffect(() => {
    if (!card) return;
    const id = setTimeout(() => patch({ discoveryCard: null }), 6500);
    return () => clearTimeout(id);
  }, [card, patch]);
  const species = card ? getSpecies(card.speciesId) : undefined;
  if (!card || !species) return null;
  const thumb = getThumbnail(species);
  return (
    <div className="discovery-card" key={card.at} data-testid="discovery-card" data-species={species.id} role="status">
      <div className="portrait">{thumb ? <img src={thumb} alt="" /> : null}</div>
      <div className="text">
        <div className="eyebrow">{t('discovery.new')}</div>
        <h3>{speciesText.name(species, lang)}</h3>
        <div className="sci">{species.scientificName}</div>
        <div className="meta">
          <span className="chip">{td(`category.${species.category}`)}</span>
          <span>{t(card.method === 'scan' ? 'discovery.byScan' : 'discovery.byPhoto')}</span>
        </div>
        <div className="card-hint">{t('discovery.open')}</div>
      </div>
    </div>
  );
}

export function Hud(): React.JSX.Element | null {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  useTick(100);
  const tool = useGame((s) => s.tool);
  const overlay = useGame((s) => s.overlay);
  const prompt = useGame((s) => s.prompt);
  const hudHidden = useGame((s) => s.hudHidden);
  const slowmo = useGame((s) => s.slowmo);
  const recording = useGame((s) => s.recording);
  const showPerf = useGame((s) => s.settings.showPerf);
  const waypoint = useGame((s) => s.waypoint);
  const discovered = useGame((s) => s.discovered);
  const p = runtime.player;
  const perf = runtime.perf;
  const target = runtime.target;
  const hidden = hudHidden && tool !== 'none';
  // While looking through an instrument the viewport is kept clear.
  const lens = tool === 'camera' || tool === 'video' || tool === 'binoculars' || tool === 'scanner';
  const species = target ? getSpecies(target.speciesId) : undefined;
  const known = species && discovered[species.id];

  return (
    <div className="hud" data-testid="hud" data-biome={p.biome} data-tool={tool}>
      {runtime.camera.underwater && <div className="underwater-tint" />}
      {!hidden && (
        <>
          <Compass />
          {!lens && (
            <div className="biome" data-testid="hud-biome">
              {td(`biome.${p.biome}`)}
            </div>
          )}
          {overlay === 'none' && !lens && <Tracker />}
          {!lens && (
            <div className="toolchip glass" data-testid="hud-tool">
              <b>{td(`tool.${tool}`)}</b>
              <span className="muted" style={{ color: '#b9c7b0' }}>
                <kbd>Tab</kbd>
              </span>
            </div>
          )}
          <div className="chips">
            {recording && <div className="chip glass rec">{t('hud.rec')}</div>}
            {slowmo > 0 && <div className="chip glass">{t('hud.slowmo', { n: SLOWMO_PRESETS[slowmo] ?? 1 })}</div>}
            {runtime.camera.underwater ? <div className="chip glass">{t('hud.underwater')}</div> : p.swimming && <div className="chip glass">{t('hud.swimming')}</div>}
            {waypoint && <div className="chip glass">{t('hud.waypoint', { n: Math.round(Math.hypot(p.pos.x - waypoint[0], p.pos.z - waypoint[1])) })}</div>}
          </div>
          {tool === 'none' && overlay === 'none' && <div className="crosshair" />}
          {tool === 'none' && overlay === 'none' && target && target.distance < 14 && (
            <div className="target-label" data-testid="target-label">
              <b>{known && species ? speciesText.name(species, lang) : t('common.unknown')}</b>
              <small>{t('common.meters', { n: target.distance.toFixed(1) })}</small>
            </div>
          )}
          {prompt && overlay === 'none' && (
            <div className="prompt glass" data-testid="prompt">
              {prompt}
            </div>
          )}
          {overlay === 'none' && !input.locked && !lens && <div className="hint glass">{input.fallbackLook ? t('hud.keyboardLook') : t('hud.clickToLook')}</div>}
        </>
      )}
      <Notices />
      <DiscoveryCard />
      {showPerf && (
        <div className="perf glass" data-testid="perf" style={{ top: 124 }}>
          {`FPS        ${perf.fps.toFixed(0)}\nframe      ${perf.frameMs.toFixed(1)} ms\ndraw calls ${perf.calls}\ntriangles  ${(perf.triangles / 1000).toFixed(0)}k\nrender     ${perf.width}×${perf.height} (${Math.round(perf.renderScale * 100)}%)\nplants     ${perf.plants}\nanimals    ${perf.activeAgents}/${perf.agents}\nchunks     ${perf.chunks}\nGPU        ${perf.geometries} geo · ${perf.textures} tex`}
        </div>
      )}
    </div>
  );
}
