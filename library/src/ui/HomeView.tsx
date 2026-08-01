import { useMemo } from 'react';
import { type Route, archiveRoute } from '@/app/router';
import { Constellation } from '@/fx/Constellation';
import { buildFacets } from '@/domain/search';
import { eraColor, eraLabel, worldColor, worldMeta } from '@/domain/taxonomy';
import type { Entry } from '@/domain/types';
import { BrandMark } from './BrandMark';
import { Glyph, Portrait } from './Primitives';
import { formatDate } from './EntryView';

interface HomeViewProps {
  entries: Entry[];
  loading: boolean;
  onNavigate: (route: Route) => void;
}

/**
 * The home view.
 *
 * Same three things v1 showed — the mark, the tagline, the counts, and the two
 * recent lists — plus the worlds, which v1 put only in a sidebar that is
 * hidden entirely below 900px. On a phone there was no way to discover that
 * the archive was organised by world at all.
 *
 * The wording here is the archive's own. Nothing on this page says anything
 * v1 did not already say.
 */
export function HomeView({ entries, loading, onNavigate }: HomeViewProps) {
  const facets = useMemo(() => buildFacets(entries), [entries]);

  const palette = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) {
      const colour = eraColor(entry.stats.era, '');
      if (colour) seen.add(colour);
    }
    return seen.size ? [...seen] : ['#c8a030', '#4a80c8', '#a02030'];
  }, [entries]);

  const recent = useMemo(() => byDate(entries, 'createdAt').slice(0, 6), [entries]);
  const touched = useMemo(() => byDate(entries, 'updatedAt').slice(0, 6), [entries]);

  const worldCount = facets.length;
  const eraCount = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of entries) if (entry.stats.era) seen.add(entry.stats.era);
    return seen.size;
  }, [entries]);

  return (
    <div className="home">
      <section className="hero">
        <Constellation palette={palette} />

        <div className="hero__inner">
          {/* The logo, at the size v1 showed it. It is the front page's
              largest contentful paint, so it is eager and boxed. */}
          <BrandMark size={148} className="hero__mark" />

          <p className="hero__eyebrow label">A record of souls, scattered across the reflections</p>

          <h1 className="hero__title display gilt">Hei Mao</h1>

          <dl className="hero__figures">
            <Figure value={loading ? '—' : String(entries.length)} label={entries.length === 1 ? 'soul' : 'souls'} />
            <Figure value={loading ? '—' : String(worldCount)} label={worldCount === 1 ? 'world' : 'worlds'} />
            <Figure value={loading ? '—' : String(eraCount)} label={eraCount === 1 ? 'era' : 'eras'} />
          </dl>

          <div className="hero__actions">
            <button
              type="button"
              className="button button--gold button--large"
              onClick={() => onNavigate(archiveRoute())}
            >
              All Characters
            </button>
            <button
              type="button"
              className="button button--quiet button--large"
              onClick={() => onNavigate({ name: 'map' })}
            >
              <Glyph name="star" />
              <span>Star Map</span>
            </button>
          </div>
        </div>

        <div className="hero__fade" aria-hidden="true" />
      </section>

      {facets.length > 0 ? (
        <section className="home__section">
          <header className="home__section-head">
            <h2 className="section-head">
              <span className="lozenge" aria-hidden="true" />
              <span>Worlds</span>
              <span className="section-head__rule" aria-hidden="true" />
            </h2>
          </header>

          <ul className="worlds">
            {facets.map((facet) => {
              const pigment = worldColor(facet.world);
              const meta = worldMeta(facet.world);
              return (
                <li
                  key={facet.world}
                  className="world reveal"
                  style={{ '--world-pigment': pigment } as React.CSSProperties}
                >
                  <button type="button" onClick={() => onNavigate(archiveRoute({ world: facet.world }))}>
                    <span className="world__pip" aria-hidden="true" />
                    <span className="world__body">
                      <span className="world__name">{facet.world}</span>
                      <span className="world__meta">
                        {facet.count} {facet.count === 1 ? 'soul' : 'souls'}
                        {meta && facet.eras.length ? ` · ${facet.eras.length} ${facet.eras.length === 1 ? 'era' : 'eras'}` : ''}
                      </span>
                      {facet.eras.length > 0 ? (
                        <span className="world__eras">
                          {facet.eras.slice(0, 4).map((era) => (
                            <span
                              key={era.code}
                              className="world__era"
                              style={{ '--era-pigment': eraColor(era.code) } as React.CSSProperties}
                            >
                              {eraLabel(era.code)}
                            </span>
                          ))}
                          {facet.eras.length > 4 ? (
                            <span className="world__era world__era--more">+{facet.eras.length - 4}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    <Glyph name="chevron" className="world__go" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="home__section">
          <div className="home__columns">
            <RecentList
              title="Recently Added"
              entries={recent}
              stamp={(entry) => formatDate(entry.createdAt)}
              onNavigate={onNavigate}
            />
            <RecentList
              title="Recently Updated"
              entries={touched}
              stamp={(entry) => formatDate(entry.updatedAt)}
              onNavigate={onNavigate}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="figure">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="figure__value display">{value}</span>
        <span className="figure__label label">{label}</span>
      </dd>
    </div>
  );
}

function RecentList({
  title,
  entries,
  stamp,
  onNavigate,
}: {
  title: string;
  entries: Entry[];
  stamp: (entry: Entry) => string;
  onNavigate: (route: Route) => void;
}) {
  return (
    <section className="recent">
      <h2 className="section-head">
        <span className="lozenge" aria-hidden="true" />
        <span>{title}</span>
        <span className="section-head__rule" aria-hidden="true" />
      </h2>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className="recent__item reveal">
            <button type="button" onClick={() => onNavigate({ name: 'entry', id: entry.id })}>
              <Portrait
                entryId={entry.id}
                src={entry.portraitUrl}
                alt=""
                width={96}
                tint={eraColor(entry.stats.era, undefined)}
                className="recent__portrait"
              />
              <span className="recent__text">
                <span className="recent__name">{entry.name}</span>
                {entry.alias ? <span className="recent__alias">{entry.alias}</span> : null}
              </span>
              <time className="recent__stamp label" dateTime={entry.updatedAt}>
                {stamp(entry)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function byDate(entries: Entry[], key: 'createdAt' | 'updatedAt'): Entry[] {
  return entries
    .slice()
    .sort((a, b) => {
      const at = Date.parse(a[key]);
      const bt = Date.parse(b[key]);
      return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
    });
}
