/** Full-screen overlays shown during an expedition. */
import { useState } from 'react';
import { QUESTS } from '../../data/quests/quests';
import { getSpecies, speciesText } from '../../data/species';
import { useLang, useT, useTd, type TextKey } from '../../i18n';
import { useGame, type Tool } from '../../store/gameStore';
import { TOOL_ORDER, closeOverlay, selectTool } from '../../systems/interaction/controls';
import { returnToMenu } from '../../systems/persistence/session';
import { downloadBlob, downloadsAvailable } from '../../systems/photography/capture';
import { extensionFor, savePendingVideo } from '../../systems/video/recorder';
import { INTERACTABLES, type Interactable } from '../../world/structures/structures';
import { Inspection } from '../journal/Inspection';
import { Journal } from '../journal/Journal';
import { MapView } from '../map/MapView';
import { Panel } from './Panel';
import { SettingsBody } from './Settings';

const TOOL_KEYS: Record<Tool, string> = { camera: 'C', video: 'C → T', binoculars: 'B', scanner: 'F', macro: 'X', none: '—' };
const toolDesc = (tool: Tool): TextKey | null => (tool === 'none' ? null : (`tool.${tool}Desc` as TextKey));

function PauseMenu(): React.JSX.Element {
  const t = useT();
  const [leaving, setLeaving] = useState(false);
  return (
    <Panel title={t('pause.title')} size="mid" onClose={closeOverlay} testId="pause">
      <div className="row" style={{ marginBottom: 6 }}>
        <button type="button" className="btn" onClick={closeOverlay} data-testid="pause-resume">
          {t('common.resume')}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={leaving}
          data-testid="pause-menu"
          onClick={() => {
            setLeaving(true);
            void returnToMenu();
          }}
        >
          {t('common.mainMenu')}
        </button>
      </div>
      <SettingsBody inGame />
    </Panel>
  );
}

function Wheel(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const tool = useGame((s) => s.tool);
  return (
    <div className="scrim" data-testid="wheel" style={{ background: 'rgba(8,12,9,0.35)' }}>
      <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
        <div className="wheel">
          {TOOL_ORDER.map((id, i) => {
            const desc = toolDesc(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                data-testid={`wheel-${id}`}
                onClick={() => {
                  selectTool(id);
                  closeOverlay();
                }}
              >
                <kbd>{i + 1}</kbd>
                <b>{td(`tool.${id}`)}</b>
                {desc && <small>{t(desc)}</small>}
              </button>
            );
          })}
        </div>
        <div className="chip glass">{t('wheel.hint')}</div>
      </div>
    </div>
  );
}

function Inventory(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const artifacts = useGame((s) => s.artifacts);
  const notes = useGame((s) => s.notes);
  const badges = useGame((s) => s.badges);
  const role = useGame((s) => s.role);
  const noteItems = notes.map((id) => INTERACTABLES.find((i) => i.id === id)).filter((i): i is Interactable => i !== undefined && i.kind === 'note');
  return (
    <Panel title={t('inventory.title')} size="mid" onClose={closeOverlay} testId="inventory">
      <p className="muted" style={{ marginTop: 0 }}>
        {t(role === 'biologist' ? 'role.biologist' : 'role.archaeologist')}
      </p>
      <div className="cat-title">{t('inventory.equipment')}</div>
      <ul className="inv-list">
        {(['camera', 'video', 'binoculars', 'scanner', 'macro'] as const).map((id) => (
          <li key={id}>
            <span>
              <b>{td(`tool.${id}`)}</b>
              <small>{t(`tool.${id}Desc`)}</small>
            </span>
            <kbd>{TOOL_KEYS[id]}</kbd>
          </li>
        ))}
        <li>
          <span>
            <b>{t('tool.journal')}</b>
            <small>{t('tool.journalDesc')}</small>
          </span>
          <kbd>J</kbd>
        </li>
      </ul>
      <div className="cat-title">{t('inventory.artifacts')}</div>
      {artifacts.length === 0 ? (
        <p className="muted">{t('inventory.empty')}</p>
      ) : (
        <ul className="inv-list">
          {artifacts.map((id) => {
            const it = INTERACTABLES.find((i) => i.id === id);
            return it ? (
              <li key={id}>
                <span>
                  <b>{t(it.title)}</b>
                  <small>{t(it.body)}</small>
                </span>
              </li>
            ) : null;
          })}
        </ul>
      )}
      <div className="cat-title">{t('inventory.notes')}</div>
      {noteItems.length === 0 ? (
        <p className="muted">{t('inventory.empty')}</p>
      ) : (
        <ul className="inv-list">
          {noteItems.map((it) => (
            <li key={it.id}>
              <span>
                <b>{t(it.title)}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="cat-title">{t('inventory.badges')}</div>
      {badges.length === 0 ? (
        <p className="muted">{t('progress.noBadges')}</p>
      ) : (
        badges.map((b) => {
          const q = QUESTS.find((x) => x.badge === b);
          return (
            <span className="badge" key={b}>
              {q ? t(q.badgeName) : b}
            </span>
          );
        })
      )}
    </Panel>
  );
}

function VideoReview(): React.JSX.Element | null {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const pending = useGame((s) => s.pendingVideo);
  const [rate, setRate] = useState(0.5);
  const [saving, setSaving] = useState(false);
  if (!pending) return null;
  const species = pending.speciesId ? getSpecies(pending.speciesId) : undefined;
  return (
    <Panel title={t('video.previewTitle')} size="mid" onClose={closeOverlay} testId="video-review" bodyStyle={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* The clip takes whatever height is left; the controls below never scroll away. */}
      <div className="video-frame">
        <video
          src={pending.url}
          controls
          autoPlay
          loop
          muted
          playsInline
          data-testid="review-video"
          ref={(el) => {
            if (el) el.playbackRate = rate;
          }}
        />
      </div>
      <div className="row" style={{ margin: '10px 0' }}>
        <span>{t('video.speed')}</span>
        <div className="seg">
          {[1, 0.5, 0.25].map((r) => (
            <button key={r} type="button" aria-pressed={rate === r} onClick={() => setRate(r)} data-testid={`review-rate-${r}`}>
              {r}×
            </button>
          ))}
        </div>
        <span className="muted tiny">{t('video.duration', { n: pending.seconds.toFixed(1) })}</span>
      </div>
      <p className="muted tiny" style={{ margin: '0 0 8px' }}>
        {t('video.slowNote')}
        {pending.simScale < 1 && ` ${t('video.simNote', { n: pending.simScale })}`}
      </p>
      <table className="data-table">
        <tbody>
          <tr>
            <th scope="row">{t('video.subject')}</th>
            <td data-testid="review-subject">{species ? speciesText.name(species, lang) : t('cam.noSubject')}</td>
          </tr>
          <tr>
            <th scope="row">{t('video.behaviors')}</th>
            <td>{pending.behaviors.length ? pending.behaviors.map((b) => td(`behavior.${b}`)).join(', ') : t('common.none')}</td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={saving}
          data-testid="review-save"
          onClick={() => {
            setSaving(true);
            void savePendingVideo().finally(() => setSaving(false));
          }}
        >
          {t('video.saveToJournal')}
        </button>
        {downloadsAvailable() ? (
          <button type="button" className="btn ghost" onClick={() => downloadBlob(pending.blob, `wildlife-${Date.now()}.${extensionFor(pending.mime)}`)} data-testid="review-download">
            {t('common.download')}
          </button>
        ) : (
          <span className="muted tiny" data-testid="no-download">{t('common.noDownload')}</span>
        )}
        <button type="button" className="btn ghost" onClick={closeOverlay} data-testid="review-discard">
          {t('common.discard')}
        </button>
      </div>
    </Panel>
  );
}

export function Overlays(): React.JSX.Element | null {
  const t = useT();
  const overlay = useGame((s) => s.overlay);
  const reader = useGame((s) => s.reader);
  switch (overlay) {
    case 'pause':
    case 'settings':
      return <PauseMenu />;
    case 'journal':
      return <Journal onClose={closeOverlay} />;
    case 'map':
      return (
        <Panel title={t('journal.map')} size="wide" onClose={closeOverlay} testId="map-panel">
          <MapView />
        </Panel>
      );
    case 'inventory':
      return <Inventory />;
    case 'wheel':
      return <Wheel />;
    case 'inspect':
      return <Inspection onClose={closeOverlay} />;
    case 'video':
      return <VideoReview />;
    case 'reader':
      return reader ? (
        <Panel title={t(reader.title)} size="small" onClose={closeOverlay} testId="reader">
          <p className="reader-body" style={{ margin: 0 }}>
            {t(reader.body)}
          </p>
        </Panel>
      ) : null;
    case 'complete':
      return (
        <Panel title={t('complete.title')} size="small" onClose={closeOverlay} testId="complete">
          <p className="reader-body" style={{ marginTop: 0 }}>
            {t('complete.body')}
          </p>
          <button type="button" className="btn" onClick={closeOverlay} data-testid="complete-continue">
            {t('complete.continue')}
          </button>
        </Panel>
      );
    default:
      return null;
  }
}
