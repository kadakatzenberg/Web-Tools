import { useEffect, useMemo, useRef } from 'react';
import { type Route, archiveRoute } from '@/app/router';
import type { Filters } from '@/domain/search';
import { buildFacets } from '@/domain/search';
import { eraLabel, worldColor } from '@/domain/taxonomy';
import type { Entry } from '@/domain/types';
import { Glyph } from './Primitives';

interface RailProps {
  entries: Entry[];
  route: Route;
  open: boolean;
  onClose: () => void;
  onNavigate: (route: Route) => void;
}

/**
 * The worlds, derived from what is actually in the archive.
 *
 * v1 built this from a constant and hid any world with no entries, so the
 * sidebar and the archive disagreed the moment someone submitted a character
 * from a world the constant had not been taught — and the fix was a code
 * change. It also showed no counts, so "The First" and a world with one
 * character looked identical until you clicked.
 *
 * Details are used rather than hand-rolled disclosure: the browser gives the
 * expanded state to assistive technology, keyboard toggling, and find-in-page
 * that opens the section containing a match.
 */
export function Rail({ entries, route, open, onClose, onNavigate }: RailProps) {
  const facets = useMemo(() => buildFacets(entries), [entries]);
  const active: Filters | null = route.name === 'archive' ? route.filters : null;
  const ref = useRef<HTMLElement>(null);

  // On narrow screens the rail is an overlay, and Escape should close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const go = (filters: Partial<Filters>) => {
    onNavigate(archiveRoute(filters, 'alpha'));
    onClose();
  };

  const total = entries.length;
  const allActive = route.name === 'archive' && !active?.world && !active?.era;

  return (
    <>
      <div
        className="rail-scrim no-print"
        data-open={open || undefined}
        onClick={onClose}
        aria-hidden="true"
      />
      <nav
        id="archive-rail"
        ref={ref}
        className="rail no-print"
        data-open={open || undefined}
        aria-label="Worlds and eras"
      >
        <button
          type="button"
          className="rail__all"
          data-active={allActive || undefined}
          onClick={() => go({})}
        >
          <span>All Characters</span>
          <span className="rail__count">{total}</span>
        </button>

        <ul className="rail__worlds">
          {facets.map((facet) => {
            const isActiveWorld = active?.world === facet.world;
            return (
              <li key={facet.world}>
                <details open={isActiveWorld || undefined}>
                  <summary
                    className="rail__world"
                    data-active={isActiveWorld || undefined}
                    style={{ '--world-pigment': worldColor(facet.world) } as React.CSSProperties}
                  >
                    <Glyph name="chevron" className="rail__chevron" />
                    <span className="rail__world-name">{facet.world}</span>
                    <span className="rail__count">{facet.count}</span>
                  </summary>

                  <div className="rail__world-actions">
                    <button
                      type="button"
                      className="rail__era"
                      data-active={(isActiveWorld && !active?.era) || undefined}
                      onClick={() => go({ world: facet.world })}
                    >
                      <span>Everything here</span>
                    </button>
                    {facet.eras.map((era) => (
                      <button
                        key={era.code}
                        type="button"
                        className="rail__era"
                        data-active={(isActiveWorld && active?.era === era.code) || undefined}
                        onClick={() => go({ world: facet.world, era: era.code })}
                      >
                        <span>{eraLabel(era.code)}</span>
                        <span className="rail__count">{era.count}</span>
                      </button>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
