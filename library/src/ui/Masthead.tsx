import { useEffect, useRef, useState } from 'react';
import type { Mode } from '@/app/hooks';
import { type Route, archiveRoute } from '@/app/router';
import { BrandMark } from './BrandMark';
import { Glyph } from './Primitives';

interface MastheadProps {
  route: Route;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onNavigate: (route: Route) => void;
  onSubmitEntry: () => void;
  onToggleRail: () => void;
  railOpen: boolean;
  count: number;
}

export function Masthead({
  route,
  mode,
  onMode,
  onNavigate,
  onSubmitEntry,
  onToggleRail,
  railOpen,
  count,
}: MastheadProps) {
  const routeQuery = route.name === 'archive' ? route.filters.query : '';
  const [query, setQuery] = useState(routeQuery);
  const input = useRef<HTMLInputElement>(null);

  // Keep the field honest when the route changes underneath it — the back
  // button, a tag click, the brand mark.
  useEffect(() => {
    setQuery(routeQuery);
  }, [routeQuery]);

  /**
   * `/` focuses search, Escape leaves it. Both are what every archive people
   * already use does, and neither existed in v1 — the only way to reach the
   * field was a mouse.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
      if (event.key === 'Escape' && target === input.current) {
        input.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runSearch = (value: string) => {
    setQuery(value);
    const trimmed = value.trim();
    if (!trimmed) {
      if (route.name === 'archive') {
        onNavigate(archiveRoute({ ...route.filters, query: '' }, route.sort));
      }
      return;
    }
    const filters = route.name === 'archive' ? route.filters : {};
    onNavigate(archiveRoute({ ...filters, query: trimmed }, 'relevance'));
  };

  return (
    <header className="masthead no-print">
      <button
        type="button"
        className="masthead__rail-toggle icon-button"
        onClick={onToggleRail}
        aria-expanded={railOpen}
        aria-controls="archive-rail"
        aria-label={railOpen ? 'Hide worlds' : 'Show worlds'}
      >
        <Glyph name="filter" />
      </button>

      <a
        className="brand"
        href="/"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onNavigate({ name: 'home' });
        }}
      >
        <BrandMark size={40} className="brand__mark" />
        <span className="brand__words">
          <span className="brand__name display gilt">Hei Mao</span>
          <span className="brand__sub">Character Library</span>
        </span>
      </a>

      <form
        className="search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(query);
        }}
      >
        <label className="sr-only" htmlFor="archive-search">
          Search the archive
        </label>
        <Glyph name="search" className="search__glyph" />
        <input
          id="archive-search"
          ref={input}
          type="search"
          value={query}
          placeholder={count ? `Search ${count} souls…` : 'Search…'}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => runSearch(event.target.value)}
        />
        <kbd className="search__key" aria-hidden="true">
          /
        </kbd>
      </form>

      <div className="masthead__actions">
        <button
          type="button"
          className="button button--quiet"
          onClick={() => onNavigate({ name: 'map' })}
        >
          <Glyph name="star" />
          <span>Star Map</span>
        </button>
        <button type="button" className="button button--gold" onClick={onSubmitEntry}>
          <Glyph name="plus" />
          <span>Submit</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => onMode(mode === 'astral' ? 'vellum' : 'astral')}
          aria-label={mode === 'astral' ? 'Switch to the vellum reading view' : 'Switch to the astral night view'}
          title={mode === 'astral' ? 'Vellum' : 'Astral'}
        >
          <Glyph name={mode === 'astral' ? 'sun' : 'moon'} />
        </button>
      </div>
    </header>
  );
}
