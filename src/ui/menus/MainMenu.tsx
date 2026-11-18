/** Main menu, role selection, and the menu-level Field Guide / Settings / Credits panels. */
import { useState } from 'react';
import { SPECIES } from '../../data/species';
import { audio } from '../../engine/audio/audio';
import { formatDate, useLang, useT } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { continueGame, hasSave, newGame, resetAllProgress } from '../../systems/persistence/session';
import type { ResearchRole } from '../../systems/persistence/save';
import { Encyclopedia } from '../journal/Encyclopedia';
import { Confirm, LanguageSwitch, Panel } from './Panel';
import { SettingsBody } from './Settings';

type MenuPanel = 'none' | 'guide' | 'settings' | 'credits';

export function MainMenu(): React.JSX.Element {
  const t = useT();
  const lang = useLang();
  const screen = useGame((s) => s.screen);
  const savedAt = useGame((s) => s.savedAt);
  const persistent = useGame((s) => s.storagePersistent);
  const corrupt = useGame((s) => s.corruptSave);
  const setScreen = useGame((s) => s.setScreen);
  const [panel, setPanel] = useState<MenuPanel>('none');
  const [role, setRole] = useState<ResearchRole>('biologist');
  const [confirm, setConfirm] = useState<'none' | 'overwrite' | 'reset'>('none');
  const [busy, setBusy] = useState(false);
  const saveExists = hasSave() && savedAt !== null;

  const begin = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    audio.start();
    try {
      await newGame(role);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="menu" data-testid="main-menu">
      <div className="menu-column">
        <div className="menu-eyebrow">{t('map.title')}</div>
        <h1>
          {t('app.title')}
          <small>{t('app.subtitle')}</small>
        </h1>

        {screen === 'menu' && (
          <>
            <p className="menu-tagline">{t('app.tagline')}</p>
            <nav className="menu-list">
              <button
                type="button"
                className="menu-btn"
                disabled={!saveExists}
                data-testid="menu-continue"
                onClick={() => {
                  audio.start();
                  continueGame();
                }}
              >
                {t('menu.continue')}
                <small>{saveExists && savedAt ? t('menu.lastSaved', { when: formatDate(savedAt, lang) }) : t('menu.noSave')}</small>
              </button>
              <button
                type="button"
                className="menu-btn"
                data-testid="menu-new"
                onClick={() => {
                  audio.start();
                  if (saveExists) setConfirm('overwrite');
                  else setScreen('role');
                }}
              >
                {t('menu.new')}
              </button>
              <button type="button" className="menu-btn" data-testid="menu-guide" onClick={() => setPanel('guide')}>
                {t('menu.guide')}
              </button>
              <button type="button" className="menu-btn" data-testid="menu-settings" onClick={() => setPanel('settings')}>
                {t('menu.settings')}
              </button>
              <button type="button" className="menu-btn" data-testid="menu-credits" onClick={() => setPanel('credits')}>
                {t('menu.credits')}
              </button>
            </nav>
            {confirm === 'overwrite' && (
              <Confirm
                text={t('menu.overwrite')}
                onYes={() => {
                  setConfirm('none');
                  setScreen('role');
                }}
                onNo={() => setConfirm('none')}
              />
            )}
            {confirm === 'reset' && (
              <Confirm
                text={t('menu.resetConfirm')}
                danger
                onYes={() => {
                  setConfirm('none');
                  void resetAllProgress();
                }}
                onNo={() => setConfirm('none')}
              />
            )}
            {!persistent && <div className="menu-note">{t('menu.storageWarning')}</div>}
            {corrupt && <div className="menu-note">{t('menu.corruptSave')}</div>}
            <div className="menu-foot">
              <LanguageSwitch />
              <button type="button" className="menu-btn" style={{ fontSize: 13, padding: '4px 10px' }} disabled={!saveExists} data-testid="menu-reset" onClick={() => setConfirm('reset')}>
                {t('menu.reset')}
              </button>
            </div>
          </>
        )}

        {screen === 'role' && (
          <>
            <p className="menu-tagline">{t('role.title')}</p>
            <div className="role-grid">
              <button type="button" className="role-card" aria-pressed={role === 'biologist'} onClick={() => setRole('biologist')} data-testid="role-biologist">
                <h3>{t('role.biologist')}</h3>
                <p>{t('role.biologistDesc')}</p>
              </button>
              <button type="button" className="role-card" aria-pressed={role === 'archaeologist'} onClick={() => setRole('archaeologist')} data-testid="role-archaeologist">
                <h3>{t('role.archaeologist')}</h3>
                <p>{t('role.archaeologistDesc')}</p>
              </button>
            </div>
            <div className="row">
              <button type="button" className="btn" disabled={busy} onClick={() => void begin()} data-testid="role-begin">
                {t('role.begin')}
              </button>
              <button type="button" className="btn ghost" style={{ color: 'var(--paper)' }} onClick={() => setScreen('menu')}>
                {t('role.back')}
              </button>
            </div>
          </>
        )}
      </div>

      {panel === 'guide' && (
        <Panel title={t('guide.title')} size="wide" onClose={() => setPanel('none')} testId="guide-panel" language bodyStyle={{ padding: 0, overflow: 'hidden' }}>
          <Encyclopedia mode="guide" intro={t('guide.intro', { n: SPECIES.length })} />
        </Panel>
      )}
      {panel === 'settings' && (
        <Panel title={t('settings.title')} size="mid" onClose={() => setPanel('none')} testId="settings-panel">
          <SettingsBody inGame={false} />
        </Panel>
      )}
      {panel === 'credits' && (
        <Panel title={t('credits.title')} size="small" onClose={() => setPanel('none')} testId="credits-panel">
          <p style={{ lineHeight: 1.6, marginTop: 0 }}>{t('credits.body')}</p>
          <p className="muted tiny">{t('credits.licenses')}</p>
        </Panel>
      )}
    </div>
  );
}
