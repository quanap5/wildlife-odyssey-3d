/**
 * In-game HUD: compass, objective tracker, minimap with biome and coordinates,
 * tool bar, status and context badges, Quick View, prompts and notices.
 */
import { useEffect } from 'react';
import { LENS_TOOLS, SLOWMO_PRESETS } from '../../config';
import { QUESTS } from '../../data/quests/quests';
import { getSpecies, speciesText } from '../../data/species';
import { input } from '../../engine/input/input';
import { useLang, useT, useTd, type TextKey } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { COLLECTION_TOTALS, hasFreshItems } from '../../systems/collection/quickView';
import { activeQuest, getProgress, objectiveDone } from '../../systems/quests/engine';
import { bearingTo, headingDelta, headingFromYaw } from '../map/coords';
import { getThumbnail } from '../journal/modelPreview';
import { useTick } from '../useTick';
import { TOOLBAR, activeToolbarEntry, contextBadges, formatClock, formatCoords, isDaytime, type ContextBadgeId, type ToolbarEntry } from './hudModel';
import { Minimap } from './Minimap';
import { QuickView } from './QuickView';

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
  const earned = useGame((s) => s.badges.length);
  const q = activeQuest(quest);
  const head = (
    <div className="label">
      {t('hud.objective')}
      <span className="mission-badges" data-testid="hud-mission-badges" data-earned={earned} title={t('hud.missionBadges')}>
        ✦ {earned}/{QUESTS.length}
      </span>
    </div>
  );
  if (!q) {
    return (
      <div className="tracker glass" data-testid="tracker">
        {head}
        <h4>{t('hud.freeRoam')}</h4>
      </div>
    );
  }
  return (
    <div className="tracker glass" data-testid="tracker" data-quest={q.id}>
      {head}
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

const TOOLBAR_LABEL: Record<ToolbarEntry['id'], TextKey> = {
  camera: 'toolbar.camera',
  binoculars: 'toolbar.binoculars',
  scanner: 'toolbar.scanner',
  macro: 'toolbar.macro',
  journal: 'toolbar.journal',
  map: 'toolbar.map',
};

/** One HUD badge. Labels use the display face, figures the monospaced one. */
function Badge(props: { id: string; tone?: 'rec' | 'accent'; testId?: string; title?: string; children: React.ReactNode; attrs?: Record<string, string | number> }): React.JSX.Element {
  return (
    <span className={`hud-badge glass ${props.tone ?? ''}`} data-badge={props.id} data-testid={props.testId} title={props.title} {...props.attrs}>
      {props.children}
    </span>
  );
}

/** Bottom-left: every tool with its key, the one in use lit, and the name of what is in the hand. */
function Toolbar({ tool, overlay }: { tool: string; overlay: string }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const active = activeToolbarEntry(tool, overlay);
  return (
    <div className="toolbar glass" data-testid="toolbar" data-active={active ?? 'none'}>
      <span className="tb-name" data-testid="hud-tool">
        <b>{td(`tool.${tool}`)}</b>
        <kbd>Tab</kbd>
      </span>
      {TOOLBAR.map((e) => (
        <span key={e.id} className={`tb-item ${active === e.id ? 'on' : ''}`} data-entry={e.id} data-on={active === e.id}>
          <kbd>{e.key}</kbd>
          <span className="tb-label">{t(TOOLBAR_LABEL[e.id])}</span>
        </span>
      ))}
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
  const minimapOn = useGame((s) => s.settings.minimap);
  const viewMode = useGame((s) => s.viewMode);
  const waypoint = useGame((s) => s.waypoint);
  const discovered = useGame((s) => s.discovered);
  const quickView = useGame((s) => s.quickView);
  const fresh = useGame((s) => hasFreshItems(s, s.quickSeen));
  const p = runtime.player;
  const perf = runtime.perf;
  const target = runtime.target;
  const held = runtime.held;
  const hidden = hudHidden && tool !== 'none';
  // Looked-through tools keep the corners clear (no minimap, no Quick View).
  const lensTool = (LENS_TOOLS as readonly string[]).includes(tool);
  // While an instrument is up the viewport is kept clear of the tracker, tool bar and status badges.
  const lens = tool === 'camera' || tool === 'video' || tool === 'binoculars' || tool === 'scanner';
  const species = target ? getSpecies(target.speciesId) : undefined;
  const known = species && discovered[species.id];
  const found = Object.keys(discovered).length;
  const context = contextBadges({
    recording,
    slowmo,
    underwater: runtime.camera.underwater,
    swimming: p.swimming,
    crouching: p.crouching,
    sprinting: p.sprinting,
    waypointDistance: waypoint ? Math.hypot(p.pos.x - waypoint[0], p.pos.z - waypoint[1]) : null,
  });
  const contextText: Record<ContextBadgeId, string> = {
    rec: t('hud.rec'),
    slowmo: t('hud.slowmo', { n: SLOWMO_PRESETS[slowmo] ?? 1 }),
    underwater: t('hud.underwater'),
    swimming: t('hud.swimming'),
    crouching: t('hud.crouching'),
    sprinting: t('hud.sprinting'),
    waypoint: t('hud.waypoint', { n: waypoint ? Math.round(Math.hypot(p.pos.x - waypoint[0], p.pos.z - waypoint[1])) : 0 }),
  };
  const showMinimap = minimapOn && !hidden && !lensTool && overlay === 'none';

  return (
    <div className="hud" data-testid="hud" data-biome={p.biome} data-tool={tool} data-view={viewMode}>
      {runtime.camera.underwater && <div className="underwater-tint" />}
      {!hidden && (
        <>
          <Compass />
          {overlay === 'none' && !lens && <Tracker />}
          {!lens && <Toolbar tool={tool} overlay={overlay} />}
          <div className="hud-status">
            <div className="chips" data-testid="hud-context">
              {context.map((id) => (
                <Badge key={id} id={id} tone={id === 'rec' ? 'rec' : undefined}>
                  {contextText[id]}
                </Badge>
              ))}
            </div>
            {!lens && !quickView && (
              <div className="badges" data-testid="hud-badges">
                <Badge id="time">
                  <i aria-hidden="true">{isDaytime(runtime.time.hour) ? '☀' : '☾'}</i>
                  <span className="num">{formatClock(runtime.time.hour)}</span>
                </Badge>
                <Badge id="weather">{t(`settings.weather.${runtime.weather.state}`)}</Badge>
                <Badge id="collection" tone="accent" testId="hud-collection" title={t('hud.collection')} attrs={{ 'data-count': found, 'data-new': fresh ? 1 : 0 }}>
                  <i aria-hidden="true">❖</i>
                  <span className="num">
                    {found}/{COLLECTION_TOTALS.species}
                  </span>
                  {fresh && <span className="dot" data-testid="hud-collection-dot" />}
                  <kbd>Q</kbd>
                </Badge>
              </div>
            )}
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
          {overlay === 'none' && !input.locked && !lens && !quickView && <div className="hint glass">{input.fallbackLook ? t('hud.keyboardLook') : t('hud.clickToLook')}</div>}
        </>
      )}
      {/* Top-right column: minimap, where the player is, then whatever is transient. */}
      <div className="hud-right">
        {showMinimap && <Minimap />}
        {!hidden && !lens && (
          <div className="biome" data-testid="hud-biome">
            <span>{td(`biome.${p.biome}`)}</span>
            <span className="coords" data-testid="hud-coords">
              {formatCoords(p.pos.x, p.pos.z)}
            </span>
          </div>
        )}
        {showPerf && (
          <div className="perf glass" data-testid="perf">
            {`FPS        ${perf.fps.toFixed(0)}\nframe      ${perf.frameMs.toFixed(1)} ms\ndraw calls ${perf.calls}\ntriangles  ${(perf.triangles / 1000).toFixed(0)}k\nrender     ${perf.width}×${perf.height} (${Math.round(perf.renderScale * 100)}%)\nplants     ${perf.plants}\nanimals    ${perf.activeAgents}/${perf.agents}\nchunks     ${perf.chunks}\nGPU        ${perf.geometries} geo · ${perf.textures} tex`}
          </div>
        )}
        {quickView && overlay === 'none' && !lensTool ? <QuickView /> : <Notices />}
      </div>
      <DiscoveryCard />
      {/* What is in the hand, for tests and assistive tools; the prop itself is drawn in the 3D view. */}
      <span
        hidden
        data-testid="held-item"
        data-item={held.item ?? 'none'}
        data-raise={held.raise.toFixed(2)}
        data-at-eye={held.atEye}
        data-view-model={runtime.viewModel.visible}
      />
    </div>
  );
}
