/** Shared notebook-style panel and inline confirmation (no native dialogs). */
import type { ReactNode } from 'react';
import { LANGUAGES, useLang, useT } from '../../i18n';
import { useGame } from '../../store/gameStore';

export function Panel(props: {
  title: string;
  size?: 'wide' | 'mid' | 'small';
  onClose: () => void;
  children: ReactNode;
  head?: ReactNode;
  testId?: string;
  bodyStyle?: React.CSSProperties;
  /** Show the language switch in the header (species pages stay open while switching). */
  language?: boolean;
}): React.JSX.Element {
  const t = useT();
  return (
    <div className="scrim" data-testid={props.testId}>
      <section className={`panel ${props.size ?? 'mid'}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <header className="panel-head">
          <h2>{props.title}</h2>
          {props.head}
          {props.language && <LanguageSwitch />}
          <button type="button" className="x-btn" onClick={props.onClose} data-testid="panel-close">
            {t('common.close')} <kbd>Esc</kbd>
          </button>
        </header>
        <div className="panel-body" style={props.bodyStyle}>
          {props.children}
        </div>
      </section>
    </div>
  );
}

export function Confirm(props: { text: string; onYes: () => void; onNo: () => void; danger?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <div className="confirm" role="alertdialog">
      <span style={{ flex: 1, minWidth: 180 }}>{props.text}</span>
      <button type="button" className={`btn ${props.danger ? 'danger' : ''}`} onClick={props.onYes} data-testid="confirm-yes">
        {t('common.yes')}
      </button>
      <button type="button" className="btn ghost" onClick={props.onNo}>
        {t('common.cancel')}
      </button>
    </div>
  );
}

export function LanguageSwitch(): React.JSX.Element {
  const lang = useLang();
  const t = useT();
  const setSetting = useGame((s) => s.setSetting);
  return (
    <div className="lang-switch" role="group" aria-label={t('settings.language')}>
      {LANGUAGES.map((l) => (
        <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => setSetting('language', l.id)} data-testid={`lang-${l.id}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

