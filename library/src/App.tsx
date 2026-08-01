import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useAnnouncer, useArchive, useMode, useRouter } from '@/app/hooks';
import { titleFor } from '@/app/router';
import { ArchiveError } from '@/data/client';
import { fetchEntry, removeEntry } from '@/data/entries';
import type { Entry } from '@/domain/types';
import { ArchiveView } from '@/ui/ArchiveView';
import { EntryView } from '@/ui/EntryView';
import { HomeView } from '@/ui/HomeView';
import { Masthead } from '@/ui/Masthead';
import { Rail } from '@/ui/Rail';
import { Dialog, type Notice, Placeholder, Toasts } from '@/ui/Primitives';

/**
 * Both of these are heavy and neither is needed to read the archive, which is
 * what almost every visit is. The editor pulls in zod and a large form; the
 * star map pulls in d3-force, a worker and a WebGL renderer. Splitting them
 * off keeps the first load to the shell, the grid and the fonts.
 */
const Editor = lazy(() => import('@/ui/Editor'));
const StarMap = lazy(() => import('@/starmap/StarMap'));

export function App() {
  const { route, navigate } = useRouter();
  const archive = useArchive();
  const [mode, setMode] = useMode();
  const [railOpen, setRailOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [announcement, announce] = useAnnouncer();
  const [editing, setEditing] = useState<{ entry: Entry | null } | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const noticeId = useRef(0);

  const notify = useCallback((message: string, tone: Notice['tone'] = 'plain') => {
    const id = ++noticeId.current;
    setNotices((current) => [...current.slice(-2), { id, message, tone }]);
    announce(message);
  }, [announce]);

  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  /* Title and the canonical URL follow the route, for tab strips, history
     entries and anything that reads a share. v1 never changed either. */
  const activeEntry = route.name === 'entry' ? archive.byId.get(route.id) : undefined;
  useEffect(() => {
    document.title = titleFor(route, activeEntry?.name);
  }, [route, activeEntry?.name]);

  /* A legacy ?id= link is honoured, then quietly rewritten so what people
     copy from the address bar afterwards is the good URL. */
  useEffect(() => {
    if (route.name === 'entry' && window.location.search.includes('id=')) {
      window.history.replaceState(null, '', `/c/${encodeURIComponent(route.id)}`);
    }
  }, [route]);

  /* The rail is an overlay below 1080px; a route change should close it. */
  useEffect(() => {
    setRailOpen(false);
  }, [route]);

  const openEditorFor = useCallback(
    async (entry: Entry | null) => {
      if (!entry) {
        setEditing({ entry: null });
        return;
      }
      // The grid only holds a summary; editing needs the whole record.
      try {
        const full = await fetchEntry(entry.id);
        setEditing({ entry: full ?? entry });
      } catch {
        setEditing({ entry });
      }
    },
    [],
  );

  const isMap = route.name === 'map';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="page-glow" aria-hidden="true" />

      <Masthead
        route={route}
        mode={mode}
        onMode={setMode}
        onNavigate={navigate}
        onSubmitEntry={() => openEditorFor(null)}
        onToggleRail={() => setRailOpen((open) => !open)}
        railOpen={railOpen}
        count={archive.entries.length}
      />

      <div className="shell">
        <Rail
          entries={archive.entries}
          route={route}
          open={railOpen}
          onClose={() => setRailOpen(false)}
          onNavigate={navigate}
        />

        <main id="main" className="main" tabIndex={-1}>
          {archive.state === 'failed' && archive.entries.length === 0 ? (
            <Placeholder
              title="The archive is unreachable"
              body={archive.error?.message ?? 'Something went wrong reaching the database.'}
              action={
                <button type="button" className="button button--gold" onClick={archive.reload}>
                  Try again
                </button>
              }
            />
          ) : route.name === 'home' ? (
            <HomeView
              entries={archive.entries}
              loading={archive.state === 'loading'}
              onNavigate={navigate}
            />
          ) : route.name === 'archive' ? (
            <ArchiveView
              entries={archive.entries}
              loading={archive.state === 'loading'}
              filters={route.filters}
              sort={route.sort}
              onNavigate={navigate}
              announce={announce}
            />
          ) : route.name === 'entry' ? (
            <EntryView
              id={route.id}
              seed={activeEntry}
              known={archive.byId}
              onNavigate={navigate}
              onEdit={openEditorFor}
              onDelete={setDeleting}
              onLoaded={archive.put}
              notify={notify}
            />
          ) : null}
        </main>
      </div>

      {isMap ? (
        <Suspense fallback={<MapLoading />}>
          <StarMap
            entries={archive.entries}
            loading={archive.state === 'loading'}
            onClose={() => window.history.back()}
            onOpenEntry={(id) => navigate({ name: 'entry', id })}
          />
        </Suspense>
      ) : null}

      {editing ? (
        <Suspense fallback={null}>
          <Editor
            entry={editing.entry}
            existingIds={new Set(archive.entries.map((entry) => entry.id))}
            allEntries={archive.entries}
            onClose={() => setEditing(null)}
            onSaved={(entry) => {
              archive.put(entry);
              setEditing(null);
              notify(
                editing.entry ? 'Entry updated.' : 'Entry submitted to the archive.',
                'good',
              );
              if (!editing.entry) navigate({ name: 'entry', id: entry.id });
            }}
            notify={notify}
          />
        </Suspense>
      ) : null}

      <DeleteDialog
        entry={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          archive.drop(id);
          setDeleting(null);
          notify('Entry removed from the archive.', 'good');
          navigate({ name: 'archive', filters: { world: null, era: null, tag: null, player: null, query: '' }, sort: 'alpha' });
        }}
      />

      <Toasts notices={notices} onDismiss={dismiss} />

      {/* One live region for everything that only happened visually. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function MapLoading() {
  return (
    <div className="map-boot" role="status">
      <p className="seal">Charting the stars…</p>
    </div>
  );
}

/* ── Deletion ────────────────────────────────────────────────────────────── */

function DeleteDialog({
  entry,
  onClose,
  onDeleted,
}: {
  entry: Entry | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => {
    setPassword('');
    setError('');
    setConfirmName('');
  }, [entry?.id]);

  if (!entry) return null;

  const nameMatches = confirmName.trim().toLowerCase() === entry.name.trim().toLowerCase();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameMatches || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeEntry(entry.id, password);
      onDeleted(entry.id);
    } catch (cause) {
      setError(
        cause instanceof ArchiveError ? cause.message : 'Could not delete this entry.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete this entry"
      footer={
        <>
          <button type="button" className="button button--quiet" onClick={onClose}>
            Keep it
          </button>
          <button
            type="submit"
            form="delete-form"
            className="button button--danger"
            disabled={!nameMatches || busy}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </>
      }
    >
      <form id="delete-form" onSubmit={submit} className="form">
        {/**
         * v1 asked for a password and nothing else, so a mistyped click on a
         * button labelled "✕" next to "Edit" was one keystroke from erasing a
         * character someone had spent years on. Typing the name is the part
         * that makes the intent deliberate; the password is the part that
         * makes it authorised.
         */}
        <p className="form__note">
          This removes <strong>{entry.name}</strong> from the archive permanently. Relationships
          pointing at this entry in other records will stop resolving. There is no undo.
        </p>

        <label className="field">
          <span className="label">
            Type <strong>{entry.name}</strong> to confirm
          </span>
          <input
            type="text"
            value={confirmName}
            autoComplete="off"
            onChange={(event) => setConfirmName(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="label">Entry password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="field__hint">The entry's own password, or the archive admin password.</span>
        </label>

        {error ? (
          <p className="form__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
