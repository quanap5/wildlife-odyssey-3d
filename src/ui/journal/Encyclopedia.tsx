/**
 * Species encyclopedia: card grid plus the full species page. In 'journal'
 * mode undiscovered species are silhouettes; in 'guide' mode (main menu)
 * every entry is readable.
 */
import { useMemo, useState } from 'react';
import { PHOTO } from '../../config';
import { CATEGORIES, SPECIES, getSpecies, searchSpecies, speciesText, type SpeciesRecord } from '../../data/species';
import { formatDate, useLang, useT, useTd } from '../../i18n';
import { useGame } from '../../store/gameStore';
import { getThumbnail } from './modelPreview';

function Thumb({ species, size }: { species: SpeciesRecord; size?: number }): React.JSX.Element {
  const url = useMemo(() => getThumbnail(species), [species]);
  if (!url) return <div className="thumb-blank">{species.commonNameEn.charAt(0)}</div>;
  return <img src={url} alt="" width={size} height={size} draggable={false} />;
}

export function SpeciesPage({ species, mode }: { species: SpeciesRecord; mode: 'journal' | 'guide' }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const record = useGame((s) => s.discovered[species.id]);
  const photos = useGame((s) => s.photos);
  const videos = useGame((s) => s.videos);
  const openInspect = useGame((s) => s.openInspect);
  const patch = useGame((s) => s.patch);
  const screen = useGame((s) => s.screen);
  const myPhotos = photos.filter((p) => p.speciesId === species.id);
  const myVideos = videos.filter((v) => v.speciesId === species.id);
  const factsUnlocked = mode === 'guide' || (record?.bestQuality ?? 0) >= PHOTO.highQuality;
  const v = species.verification;
  const diet = speciesText.diet(species, lang);
  const rows: [string, React.ReactNode][] = [
    [t('species.scientific'), <span className="sci" key="s">{species.scientificName}</span>],
    [t('species.family'), species.family],
    [t('species.order'), species.order],
    [t('species.class'), species.className],
    [t('species.phylum'), species.phylum],
    [t('species.kingdom'), species.kingdom],
    [t('species.habitat'), species.habitats.map((h) => td(`biome.${h}`)).join(' · ')],
  ];
  if (diet.length) rows.push([t('species.diet'), diet.join(', ')]);
  const size = speciesText.size(species, lang);
  if (size) rows.push([t('species.size'), size]);
  const lifespan = speciesText.lifespan(species, lang);
  if (lifespan) rows.push([t('species.lifespan'), lifespan]);
  rows.push([
    t('species.status'),
    species.conservationStatus ? (
      <span key="c">
        <span className={`status-pill ${species.conservationStatus}`}>{species.conservationStatus}</span>
        {td(`iucn.${species.conservationStatus}`)}
      </span>
    ) : (
      <span className="muted" key="c">
        {t('species.statusUnclaimed')}
      </span>
    ),
  ]);

  return (
    <article className="species-page" data-testid="species-page" data-species={species.id}>
      <div className="species-hero">
        <Thumb species={species} size={180} />
        <div>
          <h3 data-testid="species-name">{speciesText.name(species, lang)}</h3>
          <p className="alt" data-testid="species-alt-name">
            {speciesText.altName(species, lang)}
          </p>
          <p className="sci" style={{ margin: '4px 0 10px' }} data-testid="species-scientific">
            {species.scientificName}
          </p>
          <div className="row">
            <span className="status-pill">{td(`category.${species.category}`)}</span>
            {screen === 'playing' && (
              <button type="button" className="btn" onClick={() => openInspect({ speciesId: species.id })} data-testid="species-inspect">
                {t('species.inspect')}
              </button>
            )}
          </div>
        </div>
      </div>

      <table className="data-table">
        <tbody>
          {rows.map(([k, val]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>{t('species.description')}</h4>
      <p>{speciesText.description(species, lang)}</p>
      {speciesText.behavior(species, lang) && (
        <>
          <h4>{t('species.behavior')}</h4>
          <p>{speciesText.behavior(species, lang)}</p>
        </>
      )}
      {speciesText.adaptations(species, lang).length > 0 && (
        <>
          <h4>{t('species.adaptations')}</h4>
          <ul>
            {speciesText.adaptations(species, lang).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {speciesText.role(species, lang) && (
        <>
          <h4>{t('species.role')}</h4>
          <p>{speciesText.role(species, lang)}</p>
        </>
      )}
      <h4>{t('species.facts')}</h4>
      {factsUnlocked ? (
        <ul>
          {speciesText.facts(species, lang).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : (
        <p className="locked-note">{t('species.factsLocked', { n: PHOTO.highQuality })}</p>
      )}

      {mode === 'journal' && record && (
        <>
          <h4>{t('species.observed')}</h4>
          <table className="data-table">
            <tbody>
              <tr>
                <th scope="row">{t('species.firstSeen')}</th>
                <td>
                  {formatDate(record.at, lang)} · {td(`biome.${record.biome}`)}{' '}
                  <button type="button" className="x-btn" onClick={() => patch({ journalTab: 'map', mapFocus: [record.location[0], record.location[2]] })}>
                    {t('journal.showOnMap')}
                  </button>
                </td>
              </tr>
              <tr>
                <th scope="row">{t('scan.observation')}</th>
                <td>
                  {record.scanned ? t('scan.obsScanned') : t('scan.obsPhoto')}
                  {record.bestQuality > 0 && ` · ${t('scan.obsBest', { score: record.bestQuality })}`}
                </td>
              </tr>
              <tr>
                <th scope="row">{t('species.observedBehaviors')}</th>
                <td>{record.behaviors.length ? record.behaviors.map((b) => td(`behavior.${b}`)).join(', ') : t('common.none')}</td>
              </tr>
              <tr>
                <th scope="row">{t('species.photos')}</th>
                <td>
                  {myPhotos.length}
                  {myPhotos.length > 0 && (
                    <button type="button" className="x-btn" style={{ marginLeft: 8 }} onClick={() => patch({ journalTab: 'album' })}>
                      {t('journal.album')}
                    </button>
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">{t('species.videos')}</th>
                <td>{myVideos.length}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h4>{t('species.sources')}</h4>
      <p className={`verify ${v.taxonomy === 'verified' ? '' : 'un'}`}>{t(v.taxonomy === 'verified' ? 'species.verifiedTaxonomy' : 'species.unverifiedTaxonomy')}</p>
      {species.conservationStatus && (
        <p className={`verify ${v.conservation === 'verified' ? '' : 'un'}`}>{t(v.conservation === 'verified' ? 'species.verifiedStatus' : 'species.unverifiedStatus')}</p>
      )}
      {v.sources.length > 0 ? (
        <ul>
          {v.sources.map((src) => (
            <li key={src.url}>
              <a href={src.url} target="_blank" rel="noreferrer noopener">
                {src.label}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted tiny">{t('species.noSources')}</p>
      )}
      {v.note && <p className="muted tiny">{v.note}</p>}
      <p className="muted tiny">{t('species.modelNote')}</p>
    </article>
  );
}

export function Encyclopedia({ mode, intro }: { mode: 'journal' | 'guide'; intro?: string }): React.JSX.Element {
  const t = useT();
  const td = useTd();
  const lang = useLang();
  const discovered = useGame((s) => s.discovered);
  const journalSpecies = useGame((s) => s.journalSpecies);
  const setJournalSpecies = useGame((s) => s.setJournalSpecies);
  const [guideSelected, setGuideSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const selectedId = mode === 'journal' ? journalSpecies : guideSelected;
  const select = mode === 'journal' ? setJournalSpecies : setGuideSelected;
  const isOpen = (id: string): boolean => mode === 'guide' || Boolean(discovered[id]);
  const list = useMemo(() => searchSpecies(query).filter((s) => mode === 'guide' || query === '' || Boolean(discovered[s.id])), [query, mode, discovered]);
  const selected = selectedId && isOpen(selectedId) ? getSpecies(selectedId) : undefined;
  const count = Object.keys(discovered).length;

  return (
    <div className="journal-split">
      <div className="journal-list">
        <input className="search" type="search" placeholder={t('journal.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('journal.search')} />
        {mode === 'journal' && (
          <div className="muted tiny" data-testid="discovered-count">
            {t('journal.discovered', { n: count, total: SPECIES.length })}
          </div>
        )}
        {CATEGORIES.map((cat) => {
          const items = list.filter((s) => s.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <div className="cat-title">{td(`category.${cat}`)}</div>
              <div className="species-grid">
                {items.map((s) => {
                  const open = isOpen(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`species-card ${open ? '' : 'locked'}`}
                      aria-pressed={selectedId === s.id}
                      disabled={!open}
                      onClick={() => select(s.id)}
                      data-testid={`species-card-${s.id}`}
                      data-open={open}
                    >
                      <Thumb species={s} />
                      <span className="name">{open ? speciesText.name(s, lang) : t('journal.undiscovered')}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="journal-detail">
        {selected ? <SpeciesPage species={selected} mode={mode} /> : <div className="empty">{intro ?? t('journal.discovered', { n: count, total: SPECIES.length })}</div>}
      </div>
    </div>
  );
}
