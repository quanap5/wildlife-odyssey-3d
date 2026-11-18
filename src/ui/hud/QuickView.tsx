/**
 * Quick View: a glance at everything collected so far, shown while Q is held.
 * It never pauses the game or frees the cursor. All data comes from the store;
 * photographs use their stored thumbnails, never the full image.
 */
import { QUESTS } from '../../data/quests/quests';
import { getSpecies, speciesText } from '../../data/species';
import { useLang, useT, useTd, type TextKey } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { bestPhotoScore, quickViewRows, type CollectionKind, type QuickRow } from '../../systems/collection/quickView';
import type { PhotoMeta } from '../../systems/persistence/save';
import { loadPhoto } from '../../systems/photography/capture';
import { INTERACTABLES } from '../../world/structures/structures';
import { getThumbnail } from '../journal/modelPreview';
import { useObjectUrl } from '../useObjectUrl';

const ICON: Record<CollectionKind, string> = { species: '❖', photos: '▣', videos: '▶', artifacts: '⟐', notes: '✎', landmarks: '▲', badges: '✦' };
const TITLE: Record<CollectionKind, TextKey> = {
  species: 'quick.species',
  photos: 'quick.photos',
  videos: 'quick.videos',
  artifacts: 'quick.artifacts',
  notes: 'quick.notes',
  landmarks: 'quick.landmarks',
  badges: 'quick.badges',
};
const HINT: Record<CollectionKind, TextKey> = {
  species: 'quick.hint.species',
  photos: 'quick.hint.photos',
  videos: 'quick.hint.videos',
  artifacts: 'quick.hint.artifacts',
  notes: 'quick.hint.notes',
  landmarks: 'quick.hint.landmarks',
  badges: 'quick.hint.badges',
};

/** One stored thumbnail. The object URL lives only while the panel is open. */
function PhotoThumb({ photo, fresh }: { photo: PhotoMeta; fresh: boolean }): React.JSX.Element {
  const { url } = useObjectUrl(async () => (await loadPhoto(photo.imageBlobId))?.thumb ?? null, `quick-${photo.id}`);
  return (
    <span className={`qv-thumb ${fresh ? 'fresh' : ''}`} data-testid="quick-photo" data-photo={photo.id}>
      {url ? <img src={url} alt="" /> : null}
    </span>
  );
}

function Row({ row }: { row: QuickRow }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const photos = useGame((s) => s.photos);
  const videos = useGame((s) => s.videos);
  const fresh = new Set(row.fresh);
  let detail: React.ReactNode;
  let extra: string | null = null;
  // Portraits and thumbnails get a line of their own; every other row stays on one line where it fits.
  const media = !row.empty && (row.kind === 'species' || row.kind === 'photos');

  if (row.empty) {
    detail = <span className="qv-hint">{t(HINT[row.kind])}</span>;
  } else if (row.kind === 'species') {
    detail = (
      <span className="qv-portraits">
        {row.recent.map((id) => {
          const species = getSpecies(id);
          if (!species) return null;
          const thumb = getThumbnail(species);
          return (
            <span key={id} className={`qv-portrait ${fresh.has(id) ? 'fresh' : ''}`} data-testid="quick-species" data-species={id}>
              {thumb ? <img src={thumb} alt="" /> : null}
              <i>{speciesText.name(species, lang)}</i>
            </span>
          );
        })}
      </span>
    );
  } else if (row.kind === 'photos') {
    const best = bestPhotoScore(photos);
    extra = best === null ? null : t('quick.best', { n: best });
    detail = (
      <span className="qv-thumbs">
        {row.recent.map((id) => {
          const photo = photos.find((ph) => ph.id === id);
          return photo ? <PhotoThumb key={id} photo={photo} fresh={fresh.has(id)} /> : null;
        })}
      </span>
    );
  } else if (row.kind === 'videos') {
    const last = videos.find((v) => v.id === row.recent[0]);
    const species = last?.speciesId ? getSpecies(last.speciesId) : undefined;
    detail = <span className="qv-names">{t('quick.lastVideo', { name: species ? speciesText.name(species, lang) : t('common.unknown') })}</span>;
  } else {
    const names = row.recent.map((id) => {
      if (row.kind === 'landmarks') return td(`landmark.${id}`);
      if (row.kind === 'badges') {
        const quest = QUESTS.find((q) => q.badge === id);
        return quest ? t(quest.badgeName) : id;
      }
      const item = INTERACTABLES.find((i) => i.id === id);
      return item ? t(item.name) : id;
    });
    detail = <span className="qv-names">{names.join(' · ')}</span>;
  }

  return (
    <li className={`qv-row ${row.empty ? 'none' : ''} ${media ? 'media' : 'line'}`} data-testid={`quick-row-${row.kind}`} data-count={row.count} data-new={row.fresh.length}>
      <span className="qv-icon" aria-hidden="true">
        {ICON[row.kind]}
      </span>
      <span className="qv-head">
        <b>{t(TITLE[row.kind])}</b>
        <span className="qv-count">
          {row.count}
          {row.total !== null ? `/${row.total}` : ''}
        </span>
        {row.fresh.length > 0 && <span className="qv-new">{t('quick.new', { n: row.fresh.length })}</span>}
        {extra && <span className="qv-extra">{extra}</span>}
      </span>
      <span className="qv-detail">{detail}</span>
    </li>
  );
}

export function QuickView(): React.JSX.Element {
  const t = useT();
  const discovered = useGame((s) => s.discovered);
  const photos = useGame((s) => s.photos);
  const videos = useGame((s) => s.videos);
  const artifacts = useGame((s) => s.artifacts);
  const notes = useGame((s) => s.notes);
  const landmarks = useGame((s) => s.landmarks);
  const badges = useGame((s) => s.badges);
  const seen = useGame((s) => s.quickSeen);
  const rows = quickViewRows({ discovered, photos, videos, artifacts, notes, landmarks, badges }, seen);
  return (
    <div className="quick-view glass" data-testid="quick-view" role="status">
      <div className="qv-title">{t('quick.title')}</div>
      <ul>
        {rows.map((row) => (
          <Row key={row.kind} row={row} />
        ))}
      </ul>
      <div className="qv-foot">
        <kbd>J</kbd>: {t('quick.openJournal')}
      </div>
    </div>
  );
}
