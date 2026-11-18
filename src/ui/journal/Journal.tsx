/** Field journal: species, photographs, videos, map, progress and field notes. */
import { useMemo, useState } from 'react';
import { PHOTO } from '../../config';
import { QUESTS } from '../../data/quests/quests';
import { SPECIES, getSpecies, speciesText } from '../../data/species';
import { formatDate, useLang, useT, useTd } from '../../i18n';
import { progressSummary, useGame, type JournalTab } from '../../store/gameStore';
import type { PhotoMeta, VideoMeta } from '../../systems/persistence/save';
import { deletePhoto, downloadBlob, downloadsAvailable, loadPhoto } from '../../systems/photography/capture';
import { getProgress, objectiveDone } from '../../systems/quests/engine';
import { deleteVideo, extensionFor, loadVideo } from '../../systems/video/recorder';
import { INTERACTABLES, type Interactable } from '../../world/structures/structures';
import { LANDMARKS } from '../../world/terrain/layout';
import { MapView } from '../map/MapView';
import { useObjectUrl } from '../useObjectUrl';
import { Confirm, Panel } from '../menus/Panel';
import { Encyclopedia } from './Encyclopedia';

const TABS: { id: JournalTab; label: 'journal.encyclopedia' | 'journal.album' | 'journal.videos' | 'journal.map' | 'journal.progress' | 'journal.notes' }[] = [
  { id: 'encyclopedia', label: 'journal.encyclopedia' },
  { id: 'album', label: 'journal.album' },
  { id: 'videos', label: 'journal.videos' },
  { id: 'map', label: 'journal.map' },
  { id: 'progress', label: 'journal.progress' },
  { id: 'notes', label: 'journal.notes' },
];

function PhotoThumb({ photo, onOpen }: { photo: PhotoMeta; onOpen: () => void }): React.JSX.Element {
  const lang = useLang();
  const t = useT();
  const { url } = useObjectUrl(async () => (await loadPhoto(photo.imageBlobId))?.thumb ?? null, photo.id);
  const species = photo.speciesId ? getSpecies(photo.speciesId) : undefined;
  return (
    <button type="button" className="media-card" onClick={onOpen} data-testid="photo-card">
      {url ? <img src={url} alt="" /> : <div className="ph" />}
      <div className="meta">
        <span>{species ? speciesText.name(species, lang) : t('journal.landscape')}</span>
        {photo.speciesId && <span className={`badge-q ${photo.rating}`}>{photo.quality}</span>}
      </div>
    </button>
  );
}

function PhotoLightbox({ photo, onClose }: { photo: PhotoMeta; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const patch = useGame((s) => s.patch);
  const [confirm, setConfirm] = useState(false);
  const { url, missing, blob } = useObjectUrl(async () => (await loadPhoto(photo.imageBlobId))?.blob ?? null, `full-${photo.id}`);
  const species = photo.speciesId ? getSpecies(photo.speciesId) : undefined;
  return (
    <div className="lightbox" data-testid="photo-lightbox">
      {url ? <img src={url} alt={species ? speciesText.name(species, lang) : t('journal.landscape')} /> : <div className="empty">{missing ? t('journal.mediaMissing') : '…'}</div>}
      <div className="bar">
        <b>{species ? speciesText.name(species, lang) : t('journal.landscape')}</b>
        {photo.speciesId && (
          <span>
            {t('journal.quality')}: {photo.quality}/100 ({td(`rating.${photo.rating}`)})
          </span>
        )}
        <span>{t('journal.takenAt', { when: formatDate(photo.timestamp, lang) })}</span>
        <span>
          {td(`biome.${photo.biome}`)} · {photo.width}×{photo.height}
        </span>
        <button type="button" className="btn ghost" onClick={() => patch({ journalTab: 'map', mapFocus: [photo.location[0], photo.location[2]] })} data-testid="photo-map">
          {t('journal.showOnMap')}
        </button>
        {downloadsAvailable() ? (
          <button type="button" className="btn ghost" disabled={!blob} onClick={() => blob && downloadBlob(blob, `${photo.speciesId ?? 'landscape'}-${photo.id}.jpg`)} data-testid="photo-download">
            {t('common.download')}
          </button>
        ) : (
          <span className="muted tiny" data-testid="no-download">{t('common.noDownload')}</span>
        )}
        <button type="button" className="btn danger" onClick={() => setConfirm(true)} data-testid="photo-delete">
          {t('common.delete')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      {confirm && (
        <Confirm
          text={t('journal.deletePhoto')}
          danger
          onYes={() => {
            void deletePhoto(photo.id);
            onClose();
          }}
          onNo={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function Album(): React.JSX.Element {
  const t = useT();
  const lang = useLang();
  const photos = useGame((s) => s.photos);
  const [sort, setSort] = useState<'new' | 'old' | 'best'>('new');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const speciesIds = useMemo(() => [...new Set(photos.map((p) => p.speciesId).filter((id): id is string => id !== null))], [photos]);
  const list = useMemo(() => {
    const l = photos.filter((p) => filter === 'all' || p.speciesId === filter);
    l.sort((a, b) => (sort === 'new' ? b.timestamp - a.timestamp : sort === 'old' ? a.timestamp - b.timestamp : b.quality - a.quality));
    return l;
  }, [photos, sort, filter]);
  const current = open ? photos.find((p) => p.id === open) : undefined;
  if (photos.length === 0) return <div className="empty">{t('journal.emptyAlbum')}</div>;
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old' | 'best')} aria-label="sort" className="search" style={{ width: 'auto', margin: 0 }}>
          <option value="new">{t('journal.sortNewest')}</option>
          <option value="old">{t('journal.sortOldest')}</option>
          <option value="best">{t('journal.sortBest')}</option>
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('journal.filterSpecies')} className="search" style={{ width: 'auto', margin: 0 }}>
          <option value="all">
            {t('journal.filterSpecies')}: {t('common.all')}
          </option>
          {speciesIds.map((id) => {
            const s = getSpecies(id);
            return (
              <option key={id} value={id}>
                {s ? speciesText.name(s, lang) : id}
              </option>
            );
          })}
        </select>
        <span className="muted tiny">{list.length}</span>
      </div>
      <div className="media-grid">
        {list.map((p) => (
          <PhotoThumb key={p.id} photo={p} onOpen={() => setOpen(p.id)} />
        ))}
      </div>
      {current && <PhotoLightbox photo={current} onClose={() => setOpen(null)} />}
    </>
  );
}

function VideoPlayer({ video, onClose }: { video: VideoMeta; onClose: () => void }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const [rate, setRate] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const { url, missing, blob } = useObjectUrl(() => loadVideo(video.blobId), `video-${video.id}`);
  const species = video.speciesId ? getSpecies(video.speciesId) : undefined;
  return (
    <div className="lightbox" data-testid="video-player">
      {url ? (
        <video
          src={url}
          controls
          autoPlay
          loop
          muted
          ref={(el) => {
            if (el) el.playbackRate = rate;
          }}
        />
      ) : (
        <div className="empty">{missing ? t('journal.mediaMissing') : '…'}</div>
      )}
      <div className="bar">
        <b>{species ? speciesText.name(species, lang) : t('journal.landscape')}</b>
        {video.behaviors.length > 0 && <span>{video.behaviors.map((b) => td(`behavior.${b}`)).join(', ')}</span>}
        <span>{t('video.duration', { n: video.seconds })}</span>
        <span>{t('video.speed')}:</span>
        <div className="seg">
          {[1, 0.5, 0.25].map((r) => (
            <button key={r} type="button" aria-pressed={rate === r} onClick={() => setRate(r)} style={{ color: '#1b2219' }} data-testid={`rate-${r}`}>
              {r}×
            </button>
          ))}
        </div>
        {downloadsAvailable() ? (
          <button type="button" className="btn ghost" disabled={!blob} onClick={() => blob && downloadBlob(blob, `${video.speciesId ?? 'wildlife'}-${video.id}.${extensionFor(video.mime)}`)}>
            {t('common.download')}
          </button>
        ) : (
          <span className="muted tiny" data-testid="no-download">{t('common.noDownload')}</span>
        )}
        <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
          {t('common.delete')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="bar tiny" style={{ opacity: 0.8 }}>
        {t('video.slowNote')}
        {video.simScale < 1 && ` ${t('video.simNote', { n: video.simScale })}`}
      </div>
      {confirm && (
        <Confirm
          text={t('journal.deleteVideo')}
          danger
          onYes={() => {
            void deleteVideo(video.id);
            onClose();
          }}
          onNo={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function Videos(): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const videos = useGame((s) => s.videos);
  const [open, setOpen] = useState<string | null>(null);
  const current = open ? videos.find((v) => v.id === open) : undefined;
  if (videos.length === 0) return <div className="empty">{t('journal.emptyVideos')}</div>;
  return (
    <>
      <div className="media-grid">
        {[...videos].reverse().map((v) => {
          const s = v.speciesId ? getSpecies(v.speciesId) : undefined;
          return (
            <button key={v.id} type="button" className="media-card" onClick={() => setOpen(v.id)} data-testid="video-card">
              <div className="ph" style={{ display: 'grid', placeItems: 'center', color: '#fff', fontSize: 26 }}>
                ▶
              </div>
              <div className="meta">
                <span>{s ? speciesText.name(s, lang) : t('journal.landscape')}</span>
                <span>{t('video.duration', { n: v.seconds })}</span>
              </div>
              <div className="meta muted" style={{ paddingTop: 0 }}>
                <span>{v.behaviors.map((b) => td(`behavior.${b}`)).join(', ') || formatDate(v.timestamp, lang)}</span>
              </div>
            </button>
          );
        })}
      </div>
      {current && <VideoPlayer video={current} onClose={() => setOpen(null)} />}
    </>
  );
}

function Progress(): React.JSX.Element {
  const t = useT();
  const state = useGame();
  const sum = progressSummary(state);
  const totalTasks = QUESTS.reduce((n, q) => n + q.objectives.filter((o) => o.kind !== 'summary').length, 0);
  const stats: [string, string][] = [
    [`${sum.species} / ${SPECIES.length}`, t('progress.species')],
    [String(sum.photos), t('progress.photos')],
    [String(sum.hqPhotos), `${t('progress.hqPhotos')} (${PHOTO.highQuality}+)`],
    [String(sum.videos), t('progress.videos')],
    [`${sum.tasks} / ${totalTasks}`, t('progress.tasks')],
    [`${sum.biomes} / 5`, t('progress.biomes')],
    [String(sum.behaviors), t('progress.behaviors')],
    [`${state.landmarks.length} / ${LANDMARKS.length}`, t('progress.landmarks')],
    [t('common.meters', { n: Math.round(state.stats.distance) }), t('progress.distance')],
  ];
  return (
    <div data-testid="progress-tab">
      <div className="stat-grid">
        {stats.map(([value, label]) => (
          <div className="stat" key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="cat-title">{t('progress.badges')}</div>
      {state.badges.length === 0 ? (
        <p className="muted">{t('progress.noBadges')}</p>
      ) : (
        <div>
          {state.badges.map((b) => {
            const q = QUESTS.find((x) => x.badge === b);
            return (
              <span className="badge" key={b} data-testid="badge">
                {q ? t(q.badgeName) : b}
              </span>
            );
          })}
        </div>
      )}
      <div className="cat-title">{t('progress.missions')}</div>
      {QUESTS.map((q, i) => {
        const done = state.quest.completed.includes(q.id);
        const locked = i > state.quest.activeIndex;
        return (
          <div key={q.id} className={`quest ${done ? 'done' : ''}`} style={{ opacity: locked ? 0.55 : 1 }} data-testid={`quest-${q.id}`} data-done={done}>
            <h5>
              {i + 1}. {t(q.title)}
            </h5>
            <span className="muted tiny">{t(q.description)}</span>
            <ul>
              {q.objectives.map((o) => {
                const ok = done || objectiveDone(o, q, state.quest);
                const p = getProgress(state.quest, q.id, o.id);
                return (
                  <li key={o.id} className={ok ? 'done' : ''}>
                    {t(o.text)}
                    {o.kind === 'event' && o.count > 1 && !ok && (
                      <span className="muted tiny">
                        {' '}
                        ({Math.min(o.count, Math.floor(p.count))}/{o.count})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Notes(): React.JSX.Element {
  const t = useT();
  const notes = useGame((s) => s.notes);
  const artifacts = useGame((s) => s.artifacts);
  const role = useGame((s) => s.role);
  const ids = [...notes, ...artifacts.filter((a) => !notes.includes(a))];
  const items = ids.map((id) => INTERACTABLES.find((i) => i.id === id)).filter((i): i is Interactable => i !== undefined && i.kind !== 'tracks');
  const tracks = notes.filter((id) => id.startsWith('tracks-')).length;
  if (items.length === 0 && tracks === 0) return <div className="empty">{t('journal.emptyNotes')}</div>;
  return (
    <div>
      {items.map((it) => (
        <div className="note-item" key={it.id}>
          <h5>{t(it.title)}</h5>
          <p>{t(it.kind === 'stele' && role === 'archaeologist' ? 'read.stele.bodyFull' : it.body)}</p>
        </div>
      ))}
      {tracks > 0 && (
        <div className="note-item">
          <h5>{t('prompt.tracks')}</h5>
          <p>× {tracks}</p>
        </div>
      )}
    </div>
  );
}

export function Journal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const t = useT();
  const tab = useGame((s) => s.journalTab);
  const setTab = useGame((s) => s.setJournalTab);
  return (
    <Panel
      title={t('journal.title')}
      size="wide"
      onClose={onClose}
      testId="journal"
      language
      bodyStyle={tab === 'encyclopedia' ? { padding: 0, overflow: 'hidden' } : undefined}
      head={
        <div className="tabs" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" className="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} data-testid={`tab-${x.id}`}>
              {t(x.label)}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'encyclopedia' && <Encyclopedia mode="journal" />}
      {tab === 'album' && <Album />}
      {tab === 'videos' && <Videos />}
      {tab === 'map' && <MapView />}
      {tab === 'progress' && <Progress />}
      {tab === 'notes' && <Notes />}
    </Panel>
  );
}
