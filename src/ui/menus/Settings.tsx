/** Settings: graphics, audio, controls, language, time of day and weather. */
import type { QualityLevel } from '../../config';
import { useT, type TextKey } from '../../i18n';
import { useGame, type Settings } from '../../store/gameStore';
import { runtime, type WeatherState } from '../../store/runtime';
import { LanguageSwitch } from './Panel';

const LEVELS: QualityLevel[] = ['low', 'medium', 'high'];
const CONTROLS: [string, TextKey][] = [
  ['W A S D', 'control.move'],
  ['control.mouse', 'control.look'],
  ['Shift', 'control.sprint'],
  ['Ctrl', 'control.crouch'],
  ['Space', 'control.jump'],
  ['E', 'control.interact'],
  ['F', 'control.scanner'],
  ['C', 'control.camera'],
  ['B', 'control.binoculars'],
  ['X', 'control.macro'],
  ['V', 'control.perspective'],
  ['Z', 'control.slowmo'],
  ['M', 'control.map'],
  ['J', 'control.journal'],
  ['I', 'control.inventory'],
  ['Tab', 'control.wheel'],
  ['Esc', 'control.pause'],
];

function Seg<T extends string | number>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId?: string }): React.JSX.Element {
  return (
    <div className="seg" data-testid={props.testId}>
      {props.options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }): React.JSX.Element {
  return (
    <label className="field">
      <span>
        {props.label} <span className="muted tiny">{props.format ? props.format(props.value) : `${Math.round(props.value * 100)}%`}</span>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsBody({ inGame }: { inGame: boolean }): React.JSX.Element {
  const t = useT();
  const s = useGame((g) => g.settings);
  const set = useGame((g) => g.setSetting);
  const setQuality = useGame((g) => g.setQuality);
  const weatherMode = useGame((g) => g.weatherMode);
  const patch = useGame((g) => g.patch);
  const toggle = (key: keyof Pick<Settings, 'adaptive' | 'showPerf' | 'invertY'>): void => set(key, !s[key]);
  const onOff = [
    { value: 1, label: t('common.on') },
    { value: 0, label: t('common.off') },
  ];

  return (
    <div className="settings-grid">
      <h4>{t('settings.graphics')}</h4>
      <div className="field">
        <span>{t('settings.quality')}</span>
        <Seg testId="set-quality" value={s.quality} options={LEVELS.map((l) => ({ value: l, label: t(`settings.quality.${l}`) }))} onChange={setQuality} />
      </div>
      <Slider label={t('settings.renderScale')} value={s.renderScale} min={0.5} max={1.5} step={0.05} onChange={(v) => set('renderScale', v)} />
      <div className="field">
        <span>{t('settings.shadows')}</span>
        <Seg value={s.shadows} options={(['off', 'low', 'high'] as const).map((l) => ({ value: l, label: t(`settings.shadows.${l}`) }))} onChange={(v) => set('shadows', v)} />
      </div>
      <Slider label={t('settings.vegetation')} value={s.vegetation} min={0.3} max={1} step={0.05} onChange={(v) => set('vegetation', v)} />
      <div className="field">
        <span>{t('settings.drawDistance')}</span>
        <Seg value={s.drawDistance} options={LEVELS.map((l) => ({ value: l, label: t(`settings.quality.${l}`) }))} onChange={(v) => set('drawDistance', v)} />
      </div>
      <div className="field">
        <span>{t('settings.adaptive')}</span>
        <Seg value={s.adaptive ? 1 : 0} options={onOff} onChange={() => toggle('adaptive')} />
      </div>
      <div className="field">
        <span>{t('settings.perf')}</span>
        <Seg value={s.showPerf ? 1 : 0} options={onOff} onChange={() => toggle('showPerf')} />
      </div>

      <h4>{t('settings.audio')}</h4>
      <Slider label={t('settings.master')} value={s.master} min={0} max={1} step={0.05} onChange={(v) => set('master', v)} />
      <Slider label={t('settings.music')} value={s.music} min={0} max={1} step={0.05} onChange={(v) => set('music', v)} />
      <Slider label={t('settings.effects')} value={s.effects} min={0} max={1} step={0.05} onChange={(v) => set('effects', v)} />

      <h4>{t('settings.controls')}</h4>
      <Slider label={t('settings.sensitivity')} value={s.sensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => set('sensitivity', v)} format={(v) => `${v.toFixed(2)}×`} />
      <div className="field">
        <span>{t('settings.invertY')}</span>
        <Seg value={s.invertY ? 1 : 0} options={onOff} onChange={() => toggle('invertY')} />
      </div>
      <div className="field">
        <span>{t('settings.language')}</span>
        <LanguageSwitch />
      </div>

      <h4>{t('settings.world')}</h4>
      <div className="field wide">
        <span>{t('settings.dayLength')}</span>
        <Seg
          value={s.dayMinutes}
          options={[
            { value: 0, label: t('settings.day.paused') },
            { value: 48, label: t('settings.day.slow') },
            { value: 24, label: t('settings.day.normal') },
            { value: 6, label: t('settings.day.fast') },
          ]}
          onChange={(v) => set('dayMinutes', v)}
        />
      </div>
      {inGame && (
        <>
          <div className="field wide">
            <span>{t('settings.timeOfDay')}</span>
            <div className="seg" data-testid="set-time">
              {(
                [
                  ['morning', 7.5],
                  ['noon', 12],
                  ['sunset', 17.6],
                  ['night', 22],
                ] as const
              ).map(([id, hour]) => (
                <button key={id} type="button" onClick={() => (runtime.time.hour = hour)}>
                  {t(`settings.time.${id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field wide">
            <span>{t('settings.weather')}</span>
            <Seg<'auto' | WeatherState>
              testId="set-weather"
              value={weatherMode}
              options={(['auto', 'clear', 'cloudy', 'rain', 'fog'] as const).map((w) => ({ value: w, label: t(`settings.weather.${w}`) }))}
              onChange={(v) => patch({ weatherMode: v })}
            />
          </div>
        </>
      )}

      <h4>{t('settings.controlRef')}</h4>
      <div className="keys">
        {CONTROLS.map(([key, label]) => (
          <div key={label}>
            <span>{t(label)}</span>
            <kbd>{key === 'control.mouse' ? t('control.mouse') : key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
