import { useEffect, useMemo, useState } from 'react';
import { ArchiveError } from '@/data/client';
import { fetchEntry } from '@/data/entries';
import { type Route, archiveRoute } from '@/app/router';
import {
  alignmentLabel,
  eraColor,
  eraLabel,
  genderLabel,
  worldOf,
} from '@/domain/taxonomy';
import { STAT_KEYS, STAT_LABELS, type Entry, type StatKey } from '@/domain/types';
import { Glyph, Placeholder, Portrait, Sigil } from './Primitives';

interface EntryViewProps {
  id: string;
  /** The summary already in memory, shown while the full record loads. */
  seed: Entry | undefined;
  known: Map<string, Entry>;
  onNavigate: (route: Route) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onLoaded: (entry: Entry) => void;
  notify: (message: string, tone?: 'plain' | 'good' | 'bad') => void;
}

export function EntryView({
  id,
  seed,
  known,
  onNavigate,
  onEdit,
  onDelete,
  onLoaded,
  notify,
}: EntryViewProps) {
  const [entry, setEntry] = useState<Entry | null>(seed ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>(
    seed ? 'ready' : 'loading',
  );

  useEffect(() => {
    const controller = new AbortController();
    setEntry(seed ?? null);
    setState(seed ? 'ready' : 'loading');

    fetchEntry(id, controller.signal)
      .then((full) => {
        if (controller.signal.aborted) return;
        if (!full) {
          setState('missing');
          return;
        }
        setEntry(full);
        setState('ready');
        onLoaded(full);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ArchiveError && cause.kind === 'missing') setState('missing');
        else setState((current) => (current === 'ready' ? current : 'failed'));
      });

    return () => controller.abort();
    // `seed` is intentionally excluded: it changes identity on every archive
    // update and would restart the fetch for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onLoaded]);

  if (state === 'missing') {
    return (
      <Placeholder
        title="Entry not found"
        body={`No entry with the ID “${id}”. It may have been deleted, or the link may be wrong.`}
        action={
          <button
            type="button"
            className="button button--gold"
            onClick={() => onNavigate(archiveRoute())}
          >
            Back to the archive
          </button>
        }
      />
    );
  }

  if (state === 'failed' && !entry) {
    return (
      <Placeholder
        title="Could not load this entry"
        body="The archive did not respond. The connection may have dropped."
        action={
          <button type="button" className="button button--gold" onClick={() => window.location.reload()}>
            Try again
          </button>
        }
      />
    );
  }

  if (!entry) return <EntrySkeleton />;

  return (
    <Record
      entry={entry}
      known={known}
      onNavigate={onNavigate}
      onEdit={onEdit}
      onDelete={onDelete}
      notify={notify}
      partial={state === 'loading'}
    />
  );
}

/* ── The record ──────────────────────────────────────────────────────────── */

interface RecordProps {
  entry: Entry;
  known: Map<string, Entry>;
  onNavigate: (route: Route) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  notify: (message: string, tone?: 'plain' | 'good' | 'bad') => void;
  partial: boolean;
}

function Record({ entry, known, onNavigate, onEdit, onDelete, notify, partial }: RecordProps) {
  const world = worldOf(entry.stats.reflection);
  const pigment = eraColor(entry.stats.era, undefined);
  const era = eraLabel(entry.stats.era);
  const paragraphs = useMemo(
    () => entry.blurb.split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean),
    [entry.blurb],
  );

  const copyLink = async () => {
    const url = `${window.location.origin}/c/${encodeURIComponent(entry.id)}`;
    const ok = await writeClipboard(url);
    notify(ok ? 'Link copied.' : 'Could not copy — the link is in the address bar.', ok ? 'good' : 'bad');
  };

  const copyProfile = async () => {
    const ok = await writeClipboard(asDiscordMarkdown(entry));
    notify(ok ? 'Profile copied for Discord.' : 'Could not copy to the clipboard.', ok ? 'good' : 'bad');
  };

  return (
    <article className="record" style={{ '--record-pigment': pigment ?? 'var(--gold)' } as React.CSSProperties}>
      <nav className="record__bar no-print" aria-label="Entry actions">
        <button type="button" className="button button--quiet" onClick={() => window.history.back()}>
          <Glyph name="back" />
          <span>Back</span>
        </button>

        <div className="record__bar-actions">
          <button type="button" className="button button--quiet" onClick={copyLink}>
            <Glyph name="link" />
            <span>Share</span>
          </button>
          <button type="button" className="button button--quiet" onClick={copyProfile}>
            <Glyph name="copy" />
            <span className="record__bar-label">Copy profile</span>
          </button>
          <button type="button" className="button button--quiet" onClick={() => onEdit(entry)}>
            <Glyph name="edit" />
            <span className="record__bar-label">Edit</span>
          </button>
          <button type="button" className="button button--danger" onClick={() => onDelete(entry)}>
            <Glyph name="trash" />
            <span className="sr-only">Delete this entry</span>
          </button>
        </div>
      </nav>

      <div className="record__layout">
        <aside className="record__aside">
          <Portrait
            entryId={entry.id}
            src={entry.portraitUrl}
            alt={`Portrait of ${entry.name}`}
            width={480}
            tint={pigment}
            eager
            className="record__portrait"
            viewTransitionName="portrait"
          />

          {entry.quote ? (
            <blockquote className="record__quote">
              <p>{entry.quote}</p>
            </blockquote>
          ) : null}

          {entry.voiceClaim || entry.voiceClaimUrl ? (
            <Credit
              label="Voice Claim"
              text={entry.voiceClaim}
              href={entry.voiceClaimUrl}
              glyph="external"
            />
          ) : null}

          {entry.imageSong || entry.imageSongUrl ? (
            <Credit label="Image Song" text={entry.imageSong} href={entry.imageSongUrl} glyph="external" />
          ) : null}

          {entry.carrdUrl ? (
            <a className="record__link" href={entry.carrdUrl} target="_blank" rel="noopener noreferrer">
              <Glyph name="external" />
              <span>Character Carrd</span>
            </a>
          ) : null}
        </aside>

        <div className="record__main">
          <header className="record__head">
            <h1 className="record__name display">{entry.name}</h1>
            {entry.alias ? <p className="record__alias">{entry.alias}</p> : null}

            {entry.genreTags.length > 0 ? (
              <ul className="record__tags">
                {entry.genreTags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      className="tag"
                      onClick={() => onNavigate(archiveRoute({ tag }))}
                    >
                      {tag}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </header>

          <div className="record__provenance">
            <span className="record__provenance-line" aria-hidden="true" />
            <p>
              <button type="button" className="inline-link" onClick={() => onNavigate(archiveRoute({ world }))}>
                {entry.stats.reflection || world}
              </button>
              {era ? (
                <>
                  <span className="record__provenance-sep" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() => onNavigate(archiveRoute({ world, era: entry.stats.era }))}
                  >
                    {era}
                  </button>
                </>
              ) : null}
            </p>
            <span className="record__provenance-line" aria-hidden="true" />
          </div>

          {paragraphs.length > 0 ? (
            <div className="record__blurb prose">
              {paragraphs.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          ) : null}

          <StatBlock entry={entry} onNavigate={onNavigate} />

          {entry.hooks.length > 0 ? (
            <section className="record__section">
              <SectionHead>Roleplay Hooks</SectionHead>
              <ul className="hooks">
                {entry.hooks.map((hook, index) => (
                  <li key={index} className="hook reveal">
                    <p className="hook__label">{hook.label || 'Hook'}</p>
                    <p className="hook__body">{hook.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {entry.funFact ? (
            <aside className="fun-fact">
              <p className="label">Fun Fact</p>
              <p>{entry.funFact}</p>
            </aside>
          ) : null}

          {entry.relations.length > 0 ? (
            <section className="record__section">
              <SectionHead>Relationships</SectionHead>
              <ul className="relations">
                {entry.relations.map((relation, index) => {
                  const target = relation.targetId ? known.get(relation.targetId) : undefined;
                  return (
                    <li key={index} className="relation reveal">
                      {target ? (
                        <button
                          type="button"
                          className="relation__name relation__name--link"
                          onClick={() => onNavigate({ name: 'entry', id: target.id })}
                        >
                          <Sigil id={target.id} tint={eraColor(target.stats.era, undefined)} className="relation__sigil" />
                          <span>{relation.name}</span>
                        </button>
                      ) : (
                        <span className="relation__name">
                          <span className="relation__dot" aria-hidden="true" />
                          <span>{relation.name}</span>
                        </span>
                      )}
                      {relation.badge ? <span className="relation__badge">{relation.badge}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="record__section">
            <SectionHead>Soul Lineage</SectionHead>
            {entry.lineage.length > 0 ? (
              <ol className="lineage">
                {entry.lineage.map((node, index) => {
                  const target = node.targetId ? known.get(node.targetId) : undefined;
                  const nodePigment = eraColor(node.era, undefined);
                  const body = (
                    <>
                      <span className="lineage__shard">{node.shard}</span>
                      <span className="lineage__era">{eraLabel(node.era) || '—'}</span>
                      <span className="lineage__name">{node.name}</span>
                    </>
                  );
                  return (
                    <li
                      key={index}
                      className="lineage__node reveal"
                      data-self={node.isSelf || undefined}
                      style={{ '--node-pigment': nodePigment ?? 'var(--gold)' } as React.CSSProperties}
                    >
                      {target && !node.isSelf ? (
                        <button type="button" onClick={() => onNavigate({ name: 'entry', id: target.id })}>
                          {body}
                        </button>
                      ) : (
                        <div>
                          {body}
                          {node.isSelf ? <span className="lineage__here">this soul</span> : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="record__empty">— to be revealed —</p>
            )}
          </section>

          <footer className="record__foot">
            {partial ? <span className="record__loading">Loading the full record…</span> : null}
            {entry.updatedAt ? (
              <p className="label">
                Last updated <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>
              </p>
            ) : null}
          </footer>
        </div>
      </div>
    </article>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="section-head">
      <span className="lozenge" aria-hidden="true" />
      <span>{children}</span>
      <span className="section-head__rule" aria-hidden="true" />
    </h2>
  );
}

function Credit({
  label,
  text,
  href,
  glyph,
}: {
  label: string;
  text: string;
  href: string;
  glyph: string;
}) {
  return (
    <div className="credit">
      <p className="label">{label}</p>
      {href ? (
        <a className="record__link" href={href} target="_blank" rel="noopener noreferrer">
          <Glyph name={glyph} />
          <span>{text || label}</span>
        </a>
      ) : (
        <p className="credit__text">{text}</p>
      )}
    </div>
  );
}

function StatBlock({ entry, onNavigate }: { entry: Entry; onNavigate: (route: Route) => void }) {
  const world = worldOf(entry.stats.reflection);

  const display = (key: StatKey): string => {
    const raw = entry.stats[key];
    if (key === 'gender') return genderLabel(raw);
    if (key === 'alignment') return alignmentLabel(raw);
    if (key === 'era') return eraLabel(raw);
    return raw;
  };

  return (
    <dl className="stats">
      {STAT_KEYS.map((key) => {
        const value = display(key);
        const link =
          key === 'player' && entry.stats.player
            ? () => onNavigate(archiveRoute({ player: entry.stats.player }))
            : key === 'reflection' && entry.stats.reflection
              ? () => onNavigate(archiveRoute({ world }))
              : key === 'era' && entry.stats.era
                ? () => onNavigate(archiveRoute({ world, era: entry.stats.era }))
                : null;

        return (
          <div className="stats__cell" key={key}>
            <dt className="label">{STAT_LABELS[key]}</dt>
            <dd>
              {value ? (
                link ? (
                  <button type="button" className="inline-link" onClick={link}>
                    {value}
                  </button>
                ) : (
                  value
                )
              ) : (
                <span className="stats__empty">—</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function EntrySkeleton() {
  return (
    <div className="record" aria-busy="true">
      <div className="record__layout">
        <aside className="record__aside">
          <div className="record__portrait card--ghost" style={{ aspectRatio: '3 / 4' }} />
        </aside>
        <div className="record__main">
          <span className="ghost-line" style={{ width: '52%', height: '2rem' }} />
          <span className="ghost-line" style={{ width: '34%' }} />
          <span className="ghost-line" style={{ width: '92%', marginTop: '2rem' }} />
          <span className="ghost-line" style={{ width: '88%' }} />
          <span className="ghost-line" style={{ width: '74%' }} />
        </div>
      </div>
      <p className="sr-only">Loading entry…</p>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function formatDate(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied, or an insecure context; fall through */
  }
  // execCommand is deprecated but is still the only fallback that works in
  // an iframe or over plain http, which is where a local preview runs.
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * The block people actually paste into Discord.
 *
 * v1's version left a `console.log(JSON.stringify(entry))` in it, so every
 * use dumped the whole record — including, at the time, the password hash —
 * into the console.
 */
export function asDiscordMarkdown(entry: Entry): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => {
    if (value) lines.push(`**${label}:** ${value}`);
  };

  add('Name', entry.name);
  add('Alias / Title', entry.alias);
  add('Race', entry.stats.race);
  add('Gender/Pronouns', genderLabel(entry.stats.gender));
  add('Age', entry.stats.age);
  add('Alignment', alignmentLabel(entry.stats.alignment));
  add('Affiliation', entry.stats.affiliation);

  const world = worldOf(entry.stats.reflection);
  const era = eraLabel(entry.stats.era);
  if (world || era) add('Origin', [entry.stats.reflection || world, era].filter(Boolean).join(' — '));

  if (entry.blurb.trim()) lines.push('', '**Description:**', entry.blurb.trim());
  if (entry.quote.trim()) lines.push('', `_"${entry.quote.trim()}"_`);

  return lines.join('\n');
}
