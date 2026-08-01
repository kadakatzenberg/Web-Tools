/**
 * Routing.
 *
 * v1 had none. It swapped `display` on two divs and called
 * `history.replaceState` — *replace*, not push — so the browser's back button
 * left the site entirely from any character page, and the forward button never
 * lit up. On a phone, where back is a system gesture people use constantly,
 * the archive was a trap: open a character, swipe back, you are on Discord.
 *
 * Real URLs also mean a character page can be linked, and the shape of the
 * link says what it is.
 *
 *   /                     the archive's front matter
 *   /archive?...          the grid, with its filters in the query
 *   /c/:id                one character
 *   /map                  the star map
 *
 * Links already shared as `?id=kada` are honoured and rewritten, because
 * those are sitting in Discord scrollback and will be clicked for years.
 */

import type { Filters, SortKey } from '@/domain/search';
import { NO_FILTERS } from '@/domain/search';

export type Route =
  | { name: 'home' }
  | { name: 'archive'; filters: Filters; sort: SortKey }
  | { name: 'entry'; id: string }
  | { name: 'map' };

const SORTS: readonly SortKey[] = ['alpha', 'newest', 'updated', 'relevance'];

function readSort(value: string | null): SortKey {
  return SORTS.includes(value as SortKey) ? (value as SortKey) : 'alpha';
}

export function parseLocation(url: URL): Route {
  // Legacy share links: ?id=kada, from every message posted before this build.
  const legacyId = url.searchParams.get('id');
  if (legacyId && url.pathname === '/') {
    return { name: 'entry', id: legacyId };
  }

  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] === 'c' && segments[1]) {
    return { name: 'entry', id: decodeURIComponent(segments[1]) };
  }

  if (segments[0] === 'map') return { name: 'map' };

  if (segments[0] === 'archive') {
    const params = url.searchParams;
    return {
      name: 'archive',
      filters: {
        world: params.get('world') || null,
        era: params.get('era') || null,
        tag: params.get('tag') || null,
        player: params.get('player') || null,
        query: params.get('q') || '',
      },
      sort: readSort(params.get('sort')),
    };
  }

  return { name: 'home' };
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'map':
      return '/map';
    case 'entry':
      return `/c/${encodeURIComponent(route.id)}`;
    case 'archive': {
      const params = new URLSearchParams();
      const { filters, sort } = route;
      if (filters.world) params.set('world', filters.world);
      if (filters.era) params.set('era', filters.era);
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.player) params.set('player', filters.player);
      if (filters.query.trim()) params.set('q', filters.query.trim());
      if (sort !== 'alpha') params.set('sort', sort);
      const query = params.toString();
      return query ? `/archive?${query}` : '/archive';
    }
  }
}

export function archiveRoute(filters: Partial<Filters> = {}, sort: SortKey = 'alpha'): Route {
  return { name: 'archive', filters: { ...NO_FILTERS, ...filters }, sort };
}

export function currentRoute(): Route {
  return parseLocation(new URL(window.location.href));
}

/**
 * Cross-document-style transitions between routes, where supported.
 *
 * `startViewTransition` is fed a callback that must synchronously apply the
 * DOM change; React's `flushSync` is what makes that true. Without support,
 * or with reduced motion, the update just happens.
 */
export function withTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof doc.startViewTransition !== 'function' || prefersReduced) {
    update();
    return;
  }
  doc.startViewTransition(update);
}

export interface Navigation {
  route: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
}

export function pushRoute(route: Route, replace = false): void {
  const path = routeToPath(route);
  if (path === `${window.location.pathname}${window.location.search}`) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
}

/** The document title is the other half of a working back button. */
export function titleFor(route: Route, entryName?: string): string {
  switch (route.name) {
    case 'home':
      return 'Hei Mao — Character Library';
    case 'map':
      return 'Star Map — Hei Mao Library';
    case 'entry':
      return entryName ? `${entryName} — Hei Mao Library` : 'Hei Mao Library';
    case 'archive': {
      const { world, era, tag, player } = route.filters;
      const scope = tag || player || era || world;
      return scope ? `${scope} — Hei Mao Library` : 'The Archive — Hei Mao Library';
    }
  }
}
