import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArchiveError } from '@/data/client';
import { createEntry, describePortraitProblem, updateEntry, uploadPortrait } from '@/data/entries';
import { decodeEntry, encodeDraft, normaliseId } from '@/domain/codec';
import {
  ALIGNMENTS,
  AUTHORABLE_WORLDS,
  ERAS,
  GENDERS,
  GENRE_TAGS,
  eraLabel,
  fixedEraFor,
  worldMeta,
} from '@/domain/taxonomy';
import {
  MAX_HOOKS,
  MAX_TAGS,
  MIN_PASSWORD,
  type FieldErrors,
  hasErrors,
  validateDraft,
} from '@/domain/validate';
import {
  type Entry,
  type EntryDraft,
  type Relation,
  type SoulNode,
  emptyDraft,
} from '@/domain/types';
import { Dialog, Glyph, Sigil } from './Primitives';
import '@/styles/editor.css';

interface EditorProps {
  entry: Entry | null;
  existingIds: ReadonlySet<string>;
  allEntries: Entry[];
  onClose: () => void;
  onSaved: (entry: Entry) => void;
  notify: (message: string, tone?: 'plain' | 'good' | 'bad') => void;
}

function draftFrom(entry: Entry | null): EntryDraft {
  if (!entry) return emptyDraft();
  const { createdAt: _c, updatedAt: _u, ...rest } = entry;
  return structuredClone(rest);
}

/**
 * The editor.
 *
 * v1 built this by concatenating a 4,000-character HTML string, wiring events
 * with `document.querySelectorAll` after injection, and reading values back
 * out of the DOM at save time. Three consequences it actually shipped with:
 * validation could only report one problem at a time through a toast, no
 * input was ever associated with its label so a screen reader read the form
 * as an unlabelled column of boxes, and closing the dialog used
 * `confirm("Close editor?")` unconditionally — including when nothing had
 * been typed.
 */
export default function Editor({
  entry,
  existingIds,
  allEntries,
  onClose,
  onSaved,
  notify,
}: EditorProps) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftFrom(entry));
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [portraitPreview, setPortraitPreview] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const isNew = !entry;
  const pristine = useRef(JSON.stringify(draftFrom(entry)));

  const patch = useCallback((changes: Partial<EntryDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const dirty =
    JSON.stringify(draft) !== pristine.current || portraitFile !== null || password !== '';

  // Revoke the object URL rather than leaking one per file chosen.
  useEffect(() => {
    if (!portraitFile) {
      setPortraitPreview('');
      return;
    }
    const url = URL.createObjectURL(portraitFile);
    setPortraitPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [portraitFile]);

  // Re-validate as the author fixes things, but only once they have tried to
  // save — showing errors on an untouched form is hostile.
  useEffect(() => {
    if (!submitted) return;
    setErrors(validateDraft(draft, { isNew, existingIds, password, passwordConfirm }));
  }, [draft, submitted, isNew, existingIds, password, passwordConfirm]);

  const confirmClose = useCallback(() => {
    if (!dirty) return true;
    return window.confirm('Close the editor? Unsaved changes will be lost.');
  }, [dirty]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure('');

    const found = validateDraft(draft, { isNew, existingIds, password, passwordConfirm });
    setErrors(found);
    if (hasErrors(found)) {
      notify('Some fields need attention.', 'bad');
      // Move focus to the first problem so a keyboard user is not hunting.
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-invalid] input, [data-invalid] textarea, [data-invalid] select')?.focus();
      });
      return;
    }

    setBusy(true);
    try {
      let next = { ...draft, id: isNew ? normaliseId(draft.id) : draft.id };

      if (portraitFile) {
        notify('Uploading portrait…');
        const url = await uploadPortrait(portraitFile, next.id);
        next = { ...next, portraitUrl: url };
      }

      if (isNew) await createEntry(next, password);
      else await updateEntry(next, password);

      // Reconstruct what the row now looks like without a second round trip.
      onSaved(
        decodeEntry({
          ...encodeDraft(next),
          id: next.id,
          created_at: entry?.createdAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      );
    } catch (cause) {
      setFailure(cause instanceof ArchiveError ? cause.message : 'Could not save this entry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      confirmClose={confirmClose}
      title={isNew ? 'Submit an entry' : `Edit ${entry.name}`}
      footer={
        <>
          <span className="dialog__foot-note">
            {dirty ? 'Unsaved changes' : null}
          </span>
          <button type="button" className="button button--quiet" onClick={() => confirmClose() && onClose()}>
            Cancel
          </button>
          <button type="submit" form="entry-editor" className="button button--gold" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Submit entry' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="entry-editor" className="editor" onSubmit={save} noValidate>
        {failure ? (
          <p className="form__error" role="alert">
            {failure}
          </p>
        ) : null}

        <Fieldset legend="Identity">
          <div className="editor__row">
            <Field label="Name" required error={errors.name}>
              {(props) => (
                <input
                  {...props}
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Alias or title" error={errors.alias}>
              {(props) => (
                <input
                  {...props}
                  value={draft.alias}
                  onChange={(event) => patch({ alias: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          {isNew ? (
            <Field
              label="Entry ID"
              required
              error={errors.id}
              hint="The permanent part of this character's link. Lowercase letters, numbers and hyphens."
            >
              {(props) => (
                <>
                  <input
                    {...props}
                    value={draft.id}
                    onChange={(event) => patch({ id: event.target.value })}
                    onBlur={(event) => patch({ id: normaliseId(event.target.value) })}
                    placeholder="dawn-khihothe"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {draft.id ? (
                    <span className="field__hint">
                      Link will be <code>/c/{normaliseId(draft.id) || '…'}</code>
                    </span>
                  ) : null}
                </>
              )}
            </Field>
          ) : null}

          <div className="editor__row">
            <Field label="Blurb" error={errors.blurb} hint="Blank lines separate paragraphs.">
              {(props) => (
                <textarea
                  {...props}
                  value={draft.blurb}
                  rows={5}
                  onChange={(event) => patch({ blurb: event.target.value })}
                />
              )}
            </Field>
            <Field label="Quote" error={errors.quote} hint="A single line of dialogue.">
              {(props) => (
                <textarea
                  {...props}
                  value={draft.quote}
                  rows={5}
                  onChange={(event) => patch({ quote: event.target.value })}
                />
              )}
            </Field>
          </div>

          <Field label="Fun fact" error={errors.funFact}>
            {(props) => (
              <textarea
                {...props}
                value={draft.funFact}
                rows={2}
                onChange={(event) => patch({ funFact: event.target.value })}
              />
            )}
          </Field>
        </Fieldset>

        <Fieldset legend="Links">
          <Field label="Character Carrd" error={errors.carrdUrl} hint="https://…">
            {(props) => (
              <input
                {...props}
                type="url"
                value={draft.carrdUrl}
                onChange={(event) => patch({ carrdUrl: event.target.value })}
                placeholder="https://example.carrd.co"
                autoComplete="off"
              />
            )}
          </Field>

          <div className="editor__row">
            <Field label="Voice claim" error={errors.voiceClaim}>
              {(props) => (
                <input
                  {...props}
                  value={draft.voiceClaim}
                  onChange={(event) => patch({ voiceClaim: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Voice claim link" error={errors.voiceClaimUrl} hint="https://…">
              {(props) => (
                <input
                  {...props}
                  type="url"
                  value={draft.voiceClaimUrl}
                  onChange={(event) => patch({ voiceClaimUrl: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <div className="editor__row">
            <Field label="Image song" error={errors.imageSong}>
              {(props) => (
                <input
                  {...props}
                  value={draft.imageSong}
                  onChange={(event) => patch({ imageSong: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Image song link" error={errors.imageSongUrl} hint="https://…">
              {(props) => (
                <input
                  {...props}
                  type="url"
                  value={draft.imageSongUrl}
                  onChange={(event) => patch({ imageSongUrl: event.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Origin">
          <OriginFields draft={draft} patch={patch} />
        </Fieldset>

        <Fieldset legend="Details">
          <div className="editor__row">
            <Field label="Race">
              {(props) => (
                <input
                  {...props}
                  value={draft.stats.race}
                  onChange={(event) => patch({ stats: { ...draft.stats, race: event.target.value } })}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Age">
              {(props) => (
                <input
                  {...props}
                  value={draft.stats.age}
                  onChange={(event) => patch({ stats: { ...draft.stats, age: event.target.value } })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <div className="editor__row">
            <Field label="Gender and pronouns">
              {(props) => (
                <select
                  {...props}
                  value={GENDERS.some(([code]) => code === draft.stats.gender) || !draft.stats.gender ? draft.stats.gender : '__custom__'}
                  onChange={(event) =>
                    patch({
                      stats: {
                        ...draft.stats,
                        gender: event.target.value === '__custom__' ? ' ' : event.target.value,
                      },
                    })
                  }
                >
                  <option value="">—</option>
                  {GENDERS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                  <option value="__custom__">Something else…</option>
                </select>
              )}
            </Field>

            <Field label="Alignment">
              {(props) => (
                <select
                  {...props}
                  value={draft.stats.alignment}
                  onChange={(event) =>
                    patch({ stats: { ...draft.stats, alignment: event.target.value } })
                  }
                >
                  <option value="">—</option>
                  {ALIGNMENTS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {draft.stats.gender && !GENDERS.some(([code]) => code === draft.stats.gender) ? (
            <Field label="Gender and pronouns, written out">
              {(props) => (
                <input
                  {...props}
                  value={draft.stats.gender.trim()}
                  onChange={(event) => patch({ stats: { ...draft.stats, gender: event.target.value } })}
                  placeholder="e.g. Agender, they/them"
                  autoComplete="off"
                />
              )}
            </Field>
          ) : null}

          <div className="editor__row">
            <Field label="Affiliation">
              {(props) => (
                <input
                  {...props}
                  value={draft.stats.affiliation}
                  onChange={(event) =>
                    patch({ stats: { ...draft.stats, affiliation: event.target.value } })
                  }
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Player" hint="Who plays them.">
              {(props) => (
                <input
                  {...props}
                  value={draft.stats.player}
                  onChange={(event) => patch({ stats: { ...draft.stats, player: event.target.value } })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          <Field label="Lineage note" hint="A one-line summary. The full soul lineage is set below.">
            {(props) => (
              <input
                {...props}
                value={draft.stats.lineage}
                onChange={(event) => patch({ stats: { ...draft.stats, lineage: event.target.value } })}
                autoComplete="off"
              />
            )}
          </Field>
        </Fieldset>

        <Fieldset legend="Portrait">
          <div className="portrait-field">
            <div className="portrait-field__preview">
              {portraitPreview || draft.portraitUrl ? (
                <img src={portraitPreview || draft.portraitUrl} alt="" />
              ) : (
                <Sigil id={draft.id || 'new-entry'} />
              )}
            </div>
            <div className="portrait-field__controls">
              <p className="field__hint">
                Shown as a square on the grid and 3:4 on the character page, cropped from the top.
                JPEG, PNG, WebP or GIF, up to 5MB.
              </p>
              <label className="button button--quiet portrait-field__pick">
                <Glyph name="plus" />
                <span>{draft.portraitUrl || portraitFile ? 'Replace portrait' : 'Choose a portrait'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    const problem = describePortraitProblem(file);
                    if (problem) {
                      notify(problem, 'bad');
                      return;
                    }
                    setPortraitFile(file);
                  }}
                />
              </label>
              {draft.portraitUrl || portraitFile ? (
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => {
                    setPortraitFile(null);
                    patch({ portraitUrl: '' });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </Fieldset>

        <Fieldset legend="Genre tags" hint={`Up to ${MAX_TAGS}.`}>
          <TagPicker
            selected={draft.genreTags}
            onChange={(genreTags) => patch({ genreTags })}
            error={errors.genreTags}
          />
        </Fieldset>

        <Fieldset legend="Roleplay hooks" hint={`Up to ${MAX_HOOKS}. What draws other characters in.`}>
          <HookRows draft={draft} patch={patch} errors={errors} />
        </Fieldset>

        <Fieldset legend="Relationships">
          <RelationRows draft={draft} patch={patch} allEntries={allEntries} />
        </Fieldset>

        <Fieldset legend="Soul lineage" hint="Other shards of the same soul, in other worlds.">
          <LineageRows draft={draft} patch={patch} allEntries={allEntries} />
        </Fieldset>

        <Fieldset
          legend={isNew ? 'Set a password' : 'Authorise this change'}
          hint={
            isNew
              ? `At least ${MIN_PASSWORD} characters. It is what lets you edit this entry later — there is no way to recover it.`
              : "This entry's password, set when it was submitted."
          }
        >
          {isNew ? (
            <div className="editor__row">
              <Field label="Password" required error={errors.password}>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Confirm password" required error={errors.passwordConfirm}>
                {(props) => (
                  <input
                    {...props}
                    type="password"
                    value={passwordConfirm}
                    autoComplete="new-password"
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : (
            <Field label="Entry password" required>
              {(props) => (
                <input
                  {...props}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
          )}
        </Fieldset>
      </form>
    </Dialog>
  );
}

/* ── Origin ──────────────────────────────────────────────────────────────── */

function OriginFields({
  draft,
  patch,
}: {
  draft: EntryDraft;
  patch: (changes: Partial<EntryDraft>) => void;
}) {
  const authored = draft.stats.reflection;
  const isCustomWorld = Boolean(authored) && !AUTHORABLE_WORLDS.includes(authored);
  const meta = worldMeta(authored);
  const locked = fixedEraFor(authored);
  const declaredEras = meta?.eras ?? [];
  const isCustomEra =
    Boolean(draft.stats.era) && !ERAS.some((era) => era.code === draft.stats.era);

  const setWorld = (value: string) => {
    if (value === '__custom__') {
      patch({ stats: { ...draft.stats, reflection: ' ', era: '' } });
      return;
    }
    // Changing world invalidates the era, except where the world has only one.
    patch({ stats: { ...draft.stats, reflection: value, era: fixedEraFor(value) ?? '' } });
  };

  return (
    <>
      <div className="editor__row">
        <Field label="Reflection" hint="The world this character is from.">
          {(props) => (
            <select
              {...props}
              value={isCustomWorld ? '__custom__' : authored}
              onChange={(event) => setWorld(event.target.value)}
            >
              <option value="">— Select a world —</option>
              {AUTHORABLE_WORLDS.map((world) => (
                <option key={world} value={world}>
                  {world}
                </option>
              ))}
              <option value="__custom__">Somewhere else…</option>
            </select>
          )}
        </Field>

        <Field
          label="Era"
          hint={locked ? `${eraLabel(locked)} is the only era recorded for this world.` : undefined}
        >
          {(props) =>
            locked ? (
              <input {...props} value={eraLabel(locked)} readOnly />
            ) : (
              <select
                {...props}
                value={isCustomEra ? '__custom__' : draft.stats.era}
                onChange={(event) =>
                  patch({
                    stats: {
                      ...draft.stats,
                      era: event.target.value === '__custom__' ? ' ' : event.target.value,
                    },
                  })
                }
              >
                <option value="">— Select an era —</option>
                {/* The world's own eras first, then everything else, because
                    a soul can be recorded anywhere its shard turned up. */}
                {declaredEras.length > 0 ? (
                  <optgroup label={authored || 'This world'}>
                    {declaredEras.map((code) => (
                      <option key={code} value={code}>
                        {eraLabel(code)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <optgroup label="Elsewhere">
                  {ERAS.filter((era) => !declaredEras.includes(era.code)).map((era) => (
                    <option key={era.code} value={era.code}>
                      {era.label}
                    </option>
                  ))}
                </optgroup>
                <option value="__custom__">Somewhere else…</option>
              </select>
            )
          }
        </Field>
      </div>

      {isCustomWorld ? (
        <Field label="World name" hint="Written out, exactly as it should appear.">
          {(props) => (
            <input
              {...props}
              value={authored.trim()}
              onChange={(event) =>
                patch({ stats: { ...draft.stats, reflection: event.target.value } })
              }
              autoComplete="off"
            />
          )}
        </Field>
      ) : null}

      {isCustomEra && !locked ? (
        <Field label="Era name" hint="Written out, exactly as it should appear.">
          {(props) => (
            <input
              {...props}
              value={draft.stats.era.trim()}
              onChange={(event) => patch({ stats: { ...draft.stats, era: event.target.value } })}
              autoComplete="off"
            />
          )}
        </Field>
      ) : null}
    </>
  );
}

/* ── Repeating rows ──────────────────────────────────────────────────────── */

function TagPicker({
  selected,
  onChange,
  error,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  error?: string;
}) {
  const [custom, setCustom] = useState('');
  const full = selected.length >= MAX_TAGS;
  const extras = selected.filter((tag) => !GENRE_TAGS.includes(tag));

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]);
  };

  const addCustom = () => {
    const tag = custom.trim();
    if (!tag || selected.includes(tag) || full) return;
    onChange([...selected, tag]);
    setCustom('');
  };

  return (
    <div className="tag-picker">
      <ul className="tag-picker__options">
        {[...GENRE_TAGS, ...extras].map((tag) => {
          const on = selected.includes(tag);
          return (
            <li key={tag}>
              <button
                type="button"
                className="tag"
                data-on={on || undefined}
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggle(tag)}
              >
                {tag}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="tag-picker__add">
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Otherwise this submits the whole form.
            event.preventDefault();
            addCustom();
          }}
          placeholder="Add your own…"
          aria-label="Add a custom genre tag"
          disabled={full}
        />
        <button type="button" className="button button--quiet" onClick={addCustom} disabled={full}>
          Add
        </button>
      </div>

      {error ? <p className="field__error">{error}</p> : null}
      {full ? <p className="field__hint">That is the maximum of {MAX_TAGS} tags.</p> : null}
    </div>
  );
}

function HookRows({
  draft,
  patch,
  errors,
}: {
  draft: EntryDraft;
  patch: (changes: Partial<EntryDraft>) => void;
  errors: FieldErrors;
}) {
  const full = draft.hooks.length >= MAX_HOOKS;

  return (
    <div className="rows">
      {draft.hooks.map((hook, index) => (
        <div className="row" key={index}>
          <div className="editor__row">
            <Field label="Label" error={errors[`hooks.${index}.label`]}>
              {(props) => (
                <input
                  {...props}
                  value={hook.label}
                  placeholder="The Debt"
                  autoComplete="off"
                  onChange={(event) => {
                    const hooks = draft.hooks.slice();
                    hooks[index] = { ...hook, label: event.target.value };
                    patch({ hooks });
                  }}
                />
              )}
            </Field>
            <Field label="What it opens">
              {(props) => (
                <textarea
                  {...props}
                  value={hook.body}
                  rows={2}
                  onChange={(event) => {
                    const hooks = draft.hooks.slice();
                    hooks[index] = { ...hook, body: event.target.value };
                    patch({ hooks });
                  }}
                />
              )}
            </Field>
          </div>
          <RemoveRow
            label={`Remove hook ${index + 1}`}
            onClick={() => patch({ hooks: draft.hooks.filter((_, at) => at !== index) })}
          />
        </div>
      ))}

      <button
        type="button"
        className="add-row"
        disabled={full}
        onClick={() => patch({ hooks: [...draft.hooks, { label: '', body: '' }] })}
      >
        <Glyph name="plus" />
        <span>{full ? `Maximum of ${MAX_HOOKS} hooks` : 'Add a hook'}</span>
      </button>
    </div>
  );
}

function RelationRows({
  draft,
  patch,
  allEntries,
}: {
  draft: EntryDraft;
  patch: (changes: Partial<EntryDraft>) => void;
  allEntries: Entry[];
}) {
  const update = (index: number, changes: Partial<Relation>) => {
    const relations = draft.relations.slice();
    relations[index] = { ...relations[index]!, ...changes };
    patch({ relations });
  };

  return (
    <div className="rows">
      {draft.relations.map((relation, index) => (
        <div className="row" key={index}>
          <div className="editor__row">
            <EntryPicker
              label="Who"
              value={relation.name}
              targetId={relation.targetId}
              allEntries={allEntries}
              excludeId={draft.id}
              onChange={(name, targetId) => update(index, { name, targetId })}
            />
            <Field label="How" hint="sister, rival, owes a debt">
              {(props) => (
                <input
                  {...props}
                  value={relation.badge}
                  autoComplete="off"
                  onChange={(event) => update(index, { badge: event.target.value })}
                />
              )}
            </Field>
          </div>
          <RemoveRow
            label={`Remove relationship ${index + 1}`}
            onClick={() => patch({ relations: draft.relations.filter((_, at) => at !== index) })}
          />
        </div>
      ))}

      <button
        type="button"
        className="add-row"
        onClick={() =>
          patch({ relations: [...draft.relations, { name: '', badge: '', targetId: null }] })
        }
      >
        <Glyph name="plus" />
        <span>Add a relationship</span>
      </button>
    </div>
  );
}

function LineageRows({
  draft,
  patch,
  allEntries,
}: {
  draft: EntryDraft;
  patch: (changes: Partial<EntryDraft>) => void;
  allEntries: Entry[];
}) {
  const update = (index: number, changes: Partial<SoulNode>) => {
    const lineage = draft.lineage.slice();
    lineage[index] = { ...lineage[index]!, ...changes };
    patch({ lineage });
  };

  return (
    <div className="rows">
      {draft.lineage.map((node, index) => (
        <div className="row" key={index}>
          <div className="editor__row">
            <Field label="Shard" hint="First, Second, Third…">
              {(props) => (
                <input
                  {...props}
                  value={node.shard}
                  autoComplete="off"
                  onChange={(event) => update(index, { shard: event.target.value })}
                />
              )}
            </Field>
            <Field label="Era">
              {(props) => (
                <select
                  {...props}
                  value={node.era}
                  onChange={(event) => update(index, { era: event.target.value })}
                >
                  <option value="">—</option>
                  {ERAS.map((era) => (
                    <option key={era.code} value={era.code}>
                      {era.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          <div className="editor__row">
            <EntryPicker
              label="Character"
              value={node.name}
              targetId={node.targetId}
              allEntries={allEntries}
              excludeId={draft.id}
              onChange={(name, targetId) => update(index, { name, targetId })}
            />
            <div className="field">
              <span className="label">This shard</span>
              <button
                type="button"
                className="button button--quiet"
                aria-pressed={node.isSelf}
                data-on={node.isSelf || undefined}
                onClick={() => {
                  // Exactly one node can be the character being edited.
                  const lineage = draft.lineage.map((item, at) => ({
                    ...item,
                    isSelf: at === index ? !item.isSelf : false,
                  }));
                  patch({ lineage });
                }}
              >
                <Glyph name="star" />
                <span>{node.isSelf ? 'This is them' : 'Mark as them'}</span>
              </button>
            </div>
          </div>

          <RemoveRow
            label={`Remove soul node ${index + 1}`}
            onClick={() => patch({ lineage: draft.lineage.filter((_, at) => at !== index) })}
          />
        </div>
      ))}

      <button
        type="button"
        className="add-row"
        onClick={() =>
          patch({
            lineage: [...draft.lineage, { shard: '', era: '', name: '', isSelf: false, targetId: null }],
          })
        }
      >
        <Glyph name="plus" />
        <span>Add a soul node</span>
      </button>
    </div>
  );
}

/**
 * Type a name, pick an entry, get a real link.
 *
 * v1's version cleared the hidden id on every keystroke and only restored it
 * if you clicked a suggestion, so editing anything else in the row after
 * choosing — including fixing a typo in the name — silently unlinked the
 * relation. The link is what the star map draws its edges from, so the map
 * quietly lost connections that the detail page still displayed.
 */
function EntryPicker({
  label,
  value,
  targetId,
  allEntries,
  excludeId,
  onChange,
}: {
  label: string;
  value: string;
  targetId: string | null;
  allEntries: Entry[];
  excludeId: string;
  onChange: (name: string, targetId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (needle.length < 2) return [];
    return allEntries
      .filter((entry) => entry.id !== excludeId && entry.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [value, allEntries, excludeId]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (entry: Entry) => {
    onChange(entry.name, entry.id);
    setOpen(false);
  };

  const linked = targetId ? allEntries.find((entry) => entry.id === targetId) : undefined;

  return (
    <div className="field" ref={wrap}>
      <span className="label" id={`${listId}-label`}>
        {label}
      </span>
      <div className="picker">
        <input
          value={value}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-labelledby={`${listId}-label`}
          autoComplete="off"
          placeholder="Type to search the archive…"
          onChange={(event) => {
            // The link survives an edit to the text, and is only dropped when
            // the name no longer resembles the entry it points at.
            const next = event.target.value;
            const keep = linked && next.trim().toLowerCase().includes(linked.name.slice(0, 3).toLowerCase());
            onChange(next, keep ? targetId : null);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!open || matches.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((at) => (at + 1) % matches.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((at) => (at - 1 + matches.length) % matches.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const picked = matches[active];
              if (picked) choose(picked);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />

        {open && matches.length > 0 ? (
          <ul className="picker__list" id={listId} role="listbox">
            {matches.map((entry, index) => (
              <li key={entry.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  data-active={index === active || undefined}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                >
                  <Sigil id={entry.id} className="picker__sigil" />
                  <span className="picker__name">{entry.name}</span>
                  {entry.alias ? <span className="picker__alias">{entry.alias}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <span className="field__hint" data-linked={Boolean(linked) || undefined}>
        {linked ? `Linked to ${linked.name}` : 'Not linked — will show as plain text'}
      </span>
    </div>
  );
}

/* ── Small building blocks ───────────────────────────────────────────────── */

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="editor__set">
      <legend>{legend}</legend>
      {hint ? <p className="editor__set-hint">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

interface FieldRenderProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
  required: boolean | undefined;
}

/**
 * Label, control, hint and error, wired together.
 *
 * The `aria-describedby` / `aria-invalid` pairing is the part v1 had none of:
 * its hints were loose divs next to inputs, so a screen reader announced the
 * box and nothing else.
 */
function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: FieldRenderProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field" data-invalid={error ? true : undefined}>
      <label className="label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="row__remove" onClick={onClick}>
      <Glyph name="trash" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
