import { useEffect, useMemo } from 'react';
import { type Route, archiveRoute } from '@/app/router';
import type { Filters, SortKey } from '@/domain/search';
import { selectEntries } from '@/domain/search';
import { eraColor, eraLabel, worldOf } from '@/domain/taxonomy';
import type { Entry } from '@/domain/types';
import { GridSkeleton, Glyph, Placeholder, Portrait } from './Primitives';

interface ArchiveViewProps {
  entries: Entry[];
  loading: boolean;
  filters: Filters;
  sort: SortKey;
  onNavigate: (route: Route) => void;
  announce: (message: string) => void;
}

const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'alpha', label: 'A–Z' },
  { key: 'newest', label: 'Newest' },
  { key: 'updated', label: 'Updated' },
  { key: 'relevance', label: 'Best match' },
];

export function ArchiveView({
  entries,
  loading,
  filters,
  sort,
  onNavigate,
  announce,
}: ArchiveViewProps) {
  const results = useMemo(
    () => selectEntries(entries, filters, sort),
    [entries, filters, sort],
  );

  const heading = describeScope(filters);

  /**
   * The result count is the only feedback a search gives, and it is purely
   * visual. Reading it out is the difference between a usable search and a
   * silent one for anyone not looking at the grid.
   */
  useEffect(() => {
    if (loading) return;
    announce(
      results.length === 0
        ? 'No entries match.'
        : `${results.length} ${results.length === 1 ? 'entry' : 'entries'}.`,
    );
  }, [results.length, loading, announce]);

  const chips = activeChips(filters);

  return (
    <div className="archive">
      <div className="archive__head">
        <div>
          <p className="label">The Archive</p>
          <h1 className="archive__title display">{heading}</h1>
        </div>
        <p className="archive__count" aria-hidden="true">
          {loading ? '—' : `${results.length} ${results.length === 1 ? 'entry' : 'entries'}`}
        </p>
      </div>

      <hr className="rule" />

      <div className="archive__controls">
        <div className="segmented" role="group" aria-label="Sort order">
          {SORTS.map((option) => {
            // Best match is meaningless with nothing to match against.
            if (option.key === 'relevance' && !filters.query.trim()) return null;
            return (
              <button
                key={option.key}
                type="button"
                data-active={sort === option.key || undefined}
                aria-pressed={sort === option.key}
                onClick={() => onNavigate(archiveRoute(filters, option.key))}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {chips.length > 0 ? (
          <ul className="chips" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => onNavigate(archiveRoute(chip.without, sort))}
                >
                  <span className="chip__kind">{chip.kind}</span>
                  <span>{chip.label}</span>
                  <Glyph name="close" />
                  <span className="sr-only">Remove this filter</span>
                </button>
              </li>
            ))}
            {chips.length > 1 ? (
              <li>
                <button
                  type="button"
                  className="chip chip--clear"
                  onClick={() => onNavigate(archiveRoute({}, sort))}
                >
                  Clear all
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {loading ? (
        <GridSkeleton />
      ) : results.length === 0 ? (
        <Placeholder
          title="No entries found"
          body={
            filters.query.trim()
              ? `Nothing matches “${filters.query.trim()}”. Try fewer words.`
              : 'Nothing matches these filters.'
          }
          action={
            <button
              type="button"
              className="button button--gold"
              onClick={() => onNavigate(archiveRoute({}, 'alpha'))}
            >
              All Characters
            </button>
          }
        />
      ) : (
        <ul className="card-grid">
          {results.map((entry, index) => (
            <Card
              key={entry.id}
              entry={entry}
              eager={index < 12}
              onOpen={() => onNavigate({ name: 'entry', id: entry.id })}
              onTag={(tag) => onNavigate(archiveRoute({ ...filters, tag }, sort))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */

interface CardProps {
  entry: Entry;
  eager: boolean;
  onOpen: () => void;
  onTag: (tag: string) => void;
}

/**
 * One entry in the grid.
 *
 * The whole card is a link, so middle-click, cmd-click and "copy link" all
 * work — v1 bound a `click` listener to a div, so none of them did, and the
 * card was unreachable by keyboard entirely.
 *
 * The tag buttons sit *inside* that link, which is invalid and does not work,
 * so they are rendered as siblings and positioned over it instead.
 */
function Card({ entry, eager, onOpen, onTag }: CardProps) {
  const world = worldOf(entry.stats.reflection);
  const pigment = eraColor(entry.stats.era, undefined);
  const era = eraLabel(entry.stats.era);

  return (
    <li className="card reveal" style={{ '--card-pigment': pigment } as React.CSSProperties}>
      <a
        className="card__hit"
        href={`/c/${encodeURIComponent(entry.id)}`}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onOpen();
        }}
      >
        <span className="sr-only">
          {entry.name}
          {entry.alias ? `, ${entry.alias}` : ''}
          {era ? `. ${world}, ${era}.` : ''}
        </span>
      </a>

      <Portrait
        entryId={entry.id}
        src={entry.portraitUrl}
        alt=""
        width={220}
        tint={pigment}
        eager={eager}
        className="card__portrait"
      />

      <div className="card__body">
        <p className="card__name" aria-hidden="true">
          {entry.name}
        </p>
        {entry.alias ? (
          <p className="card__alias" aria-hidden="true">
            {entry.alias}
          </p>
        ) : null}

        {era ? (
          <p className="card__era" aria-hidden="true">
            <span className="card__pip" />
            {era}
          </p>
        ) : null}

        {entry.genreTags.length > 0 ? (
          <ul className="card__tags">
            {entry.genreTags.slice(0, 3).map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className="tag"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTag(tag);
                  }}
                >
                  {tag}
                  <span className="sr-only">— filter {entry.name} by this tag</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function describeScope(filters: Filters): string {
  if (filters.query.trim()) return `“${filters.query.trim()}”`;
  if (filters.tag) return filters.tag;
  if (filters.player) return `${filters.player}’s characters`;
  if (filters.era) return eraLabel(filters.era);
  if (filters.world) return filters.world;
  return 'All Characters';
}

interface Chip {
  key: string;
  kind: string;
  label: string;
  without: Partial<Filters>;
}

function activeChips(filters: Filters): Chip[] {
  const chips: Chip[] = [];
  if (filters.world) {
    chips.push({
      key: 'world',
      kind: 'World',
      label: filters.world,
      // Dropping a world drops its era too; an era alone is not a place.
      without: { ...filters, world: null, era: null },
    });
  }
  if (filters.era) {
    chips.push({ key: 'era', kind: 'Era', label: eraLabel(filters.era), without: { ...filters, era: null } });
  }
  if (filters.tag) {
    chips.push({ key: 'tag', kind: 'Tag', label: filters.tag, without: { ...filters, tag: null } });
  }
  if (filters.player) {
    chips.push({ key: 'player', kind: 'Player', label: filters.player, without: { ...filters, player: null } });
  }
  if (filters.query.trim()) {
    chips.push({
      key: 'query',
      kind: 'Search',
      label: filters.query.trim(),
      without: { ...filters, query: '' },
    });
  }
  return chips;
}
