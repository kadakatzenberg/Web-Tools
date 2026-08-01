import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveError } from '@/data/client';
import { fetchEntries } from '@/data/entries';
import type { Entry } from '@/domain/types';
import { type Route, currentRoute, parseLocation, pushRoute, withTransition } from './router';

/* ── Routing ─────────────────────────────────────────────────────────────── */

export function useRouter(): {
  route: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseLocation(new URL(window.location.href)));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    pushRoute(next, options?.replace);
    withTransition(() => setRoute(next));
    // A route change is a new page; a reader should not land mid-scroll.
    if (!options?.replace) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  return { route, navigate };
}

/* ── The archive ─────────────────────────────────────────────────────────── */

export type LoadState = 'loading' | 'ready' | 'failed';

export interface Archive {
  entries: Entry[];
  byId: Map<string, Entry>;
  state: LoadState;
  error: ArchiveError | null;
  reload: () => void;
  /** Merge a freshly saved entry without a round trip to the list endpoint. */
  put: (entry: Entry) => void;
  drop: (id: string) => void;
}

export function useArchive(): Archive {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<ArchiveError | null>(null);
  const [nonce, setNonce] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    setState((current) => (current === 'ready' ? current : 'loading'));

    fetchEntries(controller.signal)
      .then((rows) => {
        if (!live.current) return;
        setEntries(rows);
        setError(null);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (!live.current || controller.signal.aborted) return;
        setError(
          cause instanceof ArchiveError
            ? cause
            : new ArchiveError('offline', 'Could not reach the archive.'),
        );
        setState('failed');
      });

    return () => {
      live.current = false;
      controller.abort();
    };
  }, [nonce]);

  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const put = useCallback((entry: Entry) => {
    setEntries((current) => {
      const at = current.findIndex((item) => item.id === entry.id);
      if (at < 0) {
        return [...current, entry].sort((a, b) => a.name.localeCompare(b.name));
      }
      const next = current.slice();
      next[at] = entry;
      return next;
    });
  }, []);

  const drop = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  return { entries, byId, state, error, reload, put, drop };
}

/* ── Presentation mode ───────────────────────────────────────────────────── */

export type Mode = 'vellum' | 'astral';

const MODE_KEY = 'heimao.library.mode';

export function useMode(): [Mode, (mode: Mode) => void] {
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const stored = localStorage.getItem(MODE_KEY);
      if (stored === 'vellum' || stored === 'astral') return stored;
    } catch {
      /* private browsing; fall through to the system preference */
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'astral' : 'vellum';
  });

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'astral' ? '#0a0a15' : '#e9dfc6');
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* nothing to do; the choice just will not survive the tab */
    }
  }, [mode]);

  return [mode, setModeState];
}

/* ── Small utilities ─────────────────────────────────────────────────────── */

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Announce to a screen reader something that only changed visually — a
 * filtered result count, a saved entry, a failure. v1's toast was a div with
 * no role, so none of its messages ever reached a screen reader.
 */
export function useAnnouncer(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => {
    // Re-announce an identical message by clearing first.
    setMessage('');
    requestAnimationFrame(() => setMessage(next));
  }, []);
  return [message, announce];
}
