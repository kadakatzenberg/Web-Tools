import { useEffect, useRef, useState } from 'react';
import type { Mode } from '@/app/hooks';
import { type Route, archiveRoute } from '@/app/router';
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
        <span className="brand__mark" aria-hidden="true">
          <BrandSigil />
        </span>
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

/**
 * The house mark, drawn rather than fetched.
 *
 * v1 hotlinked an 80×80 PNG from Supabase storage into the masthead and again
 * into the hero at 160px, so the first paint waited on two network round trips
 * to a storage bucket for a logo. This is 400 bytes of geometry: a cat's ear
 * silhouette inside an astrolabe ring.
 */
function BrandSigil() {
  return (
    <svg viewBox="0 0 48 48" className="brand__sigil" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.3"
        strokeDasharray="2 3.5"
      />
      <path
        d="M13 30c0-7 5-12 11-12s11 5 11 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M13 30 11 19l7 4M35 30l2-11-7 4" fill="currentColor" opacity="0.9" />
      <circle cx="19.5" cy="27" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="27" r="1.6" fill="currentColor" />
      <path d="M24 31v2M21 34.5c1.8 1.2 4.2 1.2 6 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
