/** Viewfinder, binocular mask, scanner read-out and macro hint. */
import { useEffect, useState } from 'react';
import { APERTURES, GRID_MODES, PHOTO, ZOOM_PRESETS } from '../../config';
import { getSpecies, speciesText } from '../../data/species';
import { focalLengthMm } from '../../engine/camera/zoom';
import { useLang, useT, useTd } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { runtime } from '../../store/runtime';
import { currentMetrics } from '../../systems/photography/capture';
import { WEIGHTS, scorePhoto } from '../../systems/photography/quality';
import { useTick } from '../useTick';

function Subject(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const discovered = useGame((s) => s.discovered);
  const target = runtime.target;
  if (!target) {
    return (
      <div className="vf-subject" data-testid="subject" data-target="">
        <span>{t('cam.noSubject')}</span>
      </div>
    );
  }
  const species = getSpecies(target.speciesId);
  const known = species && discovered[target.speciesId];
  return (
    <div className="vf-subject" data-testid="subject" data-target={target.speciesId} data-known={Boolean(known)}>
      <b>{known && species ? speciesText.name(species, lang) : t('common.unknown')}</b>
      <span>
        {t('common.meters', { n: target.distance.toFixed(1) })}
        {target.behavior ? ` · ${td(`behavior.${target.behavior}`)}` : ''}
      </span>
    </div>
  );
}

function ScoreCard(): React.JSX.Element | null {
  const t = useT();
  const td = useTd();
  const shot = useGame((s) => s.lastShot);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!shot) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(id);
  }, [shot]);
  if (!shot || !visible) return null;
  return (
    <>
      <div className="flash" key={shot.at} />
      {shot.score && (
        <div className="scorecard glass" data-testid="scorecard" data-score={shot.score.total}>
          <h4>{td(`rating.${shot.score.rating}`)}</h4>
          <div className="big">{shot.score.total}</div>
          {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => (
            <div className="bar" key={k}>
              <span>{t(`score.${k}`)}</span>
              <i>
                <b style={{ width: `${Math.round(shot.score!.parts[k] * 100)}%` }} />
              </i>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Viewfinder({ video }: { video: boolean }): React.JSX.Element {
  const t = useT();
  const photoRes = useGame((s) => s.photoRes);
  const dof = useGame((s) => s.dof);
  const grid = useGame((s) => s.grid);
  const aperture = useGame((s) => s.aperture);
  const shots = useGame((s) => s.photos.length);
  const recording = useGame((s) => s.recording);
  const hudHidden = useGame((s) => s.hudHidden);
  const cam = runtime.camera;
  const target = runtime.target;
  const locked = target !== null && runtime.focusLock >= 1;
  const metrics = currentMetrics();
  const estimate = metrics ? scorePhoto(metrics).total : null;
  const res = PHOTO.resolutions[photoRes] ?? PHOTO.resolutions[0];
  const seconds = recording ? Math.max(0, runtime.time.real - runtime.recording.startedAt) : 0;
  if (hudHidden) return <ScoreCard />;
  return (
    <div className="viewfinder" data-testid="viewfinder" data-zoom={cam.zoom.toFixed(2)} data-fov={cam.fov.toFixed(2)} data-focus={locked ? 'locked' : target ? 'seeking' : 'none'}>
      <div className={`vf-frame grid-${GRID_MODES[grid] ?? 'thirds'}`} data-testid="vf-frame" data-grid={GRID_MODES[grid] ?? 'thirds'} />
      {/* Re-keyed on every capture so the shutter blink replays. */}
      {shots > 0 && <div key={shots} className="shutter-blink" />}
      <div className={`reticle ${locked ? 'locked' : target ? 'seeking' : ''}`} />
      <div className="vf-bar top">
        <span className={`vf-mode ${recording ? 'rec' : ''}`}>{video ? (recording ? `● ${t('hud.rec')} ${seconds.toFixed(1)}s` : t('cam.videoMode')) : t('cam.photoMode')}</span>
        <span>
          {t('cam.zoom')} {cam.zoom.toFixed(1)}× · {focalLengthMm(cam.fov)} mm
        </span>
        <span className="zoom-ticks">
          {ZOOM_PRESETS.map((z) => (
            <span key={z} className={Math.abs(cam.targetZoom - z) < 0.05 ? 'on' : ''}>
              {z}×
            </span>
          ))}
        </span>
        <span>
          {t('cam.exposure')} {cam.exposure >= 0 ? '+' : ''}
          {cam.exposure.toFixed(1)}
        </span>
        {!video && (
          <span>
            {t('cam.resolution')} {t(`cam.res.${res.id}`)}
          </span>
        )}
        <span data-testid="vf-aperture">
          {t('cam.dof')} {dof ? `f/${APERTURES[aperture] ?? 4}` : t('common.off')}
        </span>
      </div>
      <Subject />
      <div className="vf-bar bottom">
        <span>
          {t('cam.focus')} {target ? (locked ? t('cam.focusLocked') : t('cam.focusSeeking')) : '—'}
          {target ? ` · ${t('common.meters', { n: target.distance.toFixed(1) })}` : ''}
        </span>
        <span className="vf-dim">
          {t('cam.grid')} {t(`cam.grid.${GRID_MODES[grid] ?? 'thirds'}`)}
        </span>
        {estimate !== null && !video && (
          <span data-testid="estimate" data-value={estimate}>
            {t('journal.quality')} ≈ {estimate}
          </span>
        )}
      </div>
      <div className="vf-help">{video ? t('cam.videoHelp') : t('cam.help')}</div>
      <ScoreCard />
    </div>
  );
}

function Scanner(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const discovered = useGame((s) => s.discovered);
  const target = runtime.target;
  const progress = runtime.scan.progress;
  const done = target !== null && progress >= 1;
  const species = target ? getSpecies(target.speciesId) : undefined;
  const record = species ? discovered[species.id] : undefined;
  const circumference = 2 * Math.PI * 66;
  return (
    <div className="viewfinder" data-testid="scanner" data-progress={progress.toFixed(2)} data-done={done} data-target={target?.speciesId ?? ''}>
      <svg className={`scan-ring ${done ? 'done' : ''}`} viewBox="0 0 150 150" aria-hidden="true">
        <circle className="track" cx="75" cy="75" r="66" />
        {target && !done && <circle className="sweep" cx="75" cy="75" r="58" />}
        <circle className="prog" cx="75" cy="75" r="66" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
      </svg>
      <div className="scan-panel glass">
        {!target && <div className="scan-status">{t('scan.noTarget')}</div>}
        {target && !done && (
          <>
            <div className="scan-status">
              {t('scan.scanning')} {Math.round(progress * 100)}%
            </div>
            <h4>{t('common.unknown')}</h4>
            <dl>
              <dt>{t('scan.distance')}</dt>
              <dd>{t('common.meters', { n: target.distance.toFixed(1) })}</dd>
            </dl>
          </>
        )}
        {target && done && species && (
          <>
            <div className="scan-status">{t('scan.complete')}</div>
            <h4 data-testid="scan-name">{speciesText.name(species, lang)}</h4>
            <div className="sci">{species.scientificName}</div>
            <dl>
              <dt>{t('scan.distance')}</dt>
              <dd>{t('common.meters', { n: target.distance.toFixed(1) })}</dd>
              <dt>{t('species.class')}</dt>
              <dd>{species.className}</dd>
              <dt>{t('species.order')}</dt>
              <dd>{species.order}</dd>
              <dt>{t('species.family')}</dt>
              <dd>{species.family}</dd>
              <dt>{t('scan.observation')}</dt>
              <dd>
                {record ? t('scan.obsScanned') : t('scan.obsNew')}
                {record && record.bestQuality > 0 ? ` · ${t('scan.obsBest', { score: record.bestQuality })}` : ''}
              </dd>
              {target.behavior && (
                <>
                  <dt>{t('species.behavior')}</dt>
                  <dd>{td(`behavior.${target.behavior}`)}</dd>
                </>
              )}
            </dl>
            <div className="tiny" style={{ marginTop: 8, color: '#a9bba2' }}>
              {t('scan.openPage')}
            </div>
          </>
        )}
      </div>
      <div className="vf-help">{t('cam.scanHelp')}</div>
    </div>
  );
}

export function ToolOverlay(): React.JSX.Element | null {
  const t = useT();
  const tool = useGame((s) => s.tool);
  const overlay = useGame((s) => s.overlay);
  useTick(80);
  if (tool === 'none' || (overlay !== 'none' && overlay !== 'wheel')) return null;
  return (
    <div className="tool-layer" data-testid={`tool-${tool}`}>
      {(tool === 'camera' || tool === 'video') && <Viewfinder video={tool === 'video'} />}
      {tool === 'binoculars' && (
        <>
          <div className="binoculars-mask" />
          <div className="bino-cross" />
          <Subject />
          <div className="vf-bar top" style={{ justifyContent: 'center' }}>
            <span data-testid="bino-zoom" data-zoom={runtime.camera.zoom.toFixed(2)}>
              {runtime.camera.zoom.toFixed(1)}×
            </span>
          </div>
          <div className="vf-help">{t('cam.binoHelp')}</div>
        </>
      )}
      {tool === 'scanner' && <Scanner />}
      {tool === 'macro' && (
        <>
          <div className="reticle" style={{ borderRadius: '50%' }} />
          <Subject />
          <div className="vf-help">{t('cam.macroHelp')}</div>
        </>
      )}
    </div>
  );
}
