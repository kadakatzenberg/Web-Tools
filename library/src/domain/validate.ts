/**
 * Validation for the editor.
 *
 * v1 validated three things — name present, id present, passwords matching —
 * with `toast()` calls that fired one at a time, so submitting an incomplete
 * form meant discovering the problems one reload at a time. Worse, the id was
 * normalised with `.replace(/\s+/g,"-")` only, so an id containing `/` or `?`
 * was accepted and produced an entry whose share link pointed somewhere else.
 *
 * This returns every problem at once, keyed by field, and the editor renders
 * them beside the inputs they belong to.
 */

import { z } from 'zod';
import { isValidId } from './codec';
import type { EntryDraft } from './types';

export type FieldErrors = Partial<Record<string, string>>;

const MAX = {
  name: 120,
  alias: 160,
  blurb: 4000,
  quote: 600,
  funFact: 600,
  hookLabel: 80,
  hookBody: 800,
  relationName: 120,
  relationBadge: 60,
  shard: 80,
  tag: 40,
} as const;

const urlish = z
  .string()
  .trim()
  .refine((value) => value === '' || /^https?:\/\/\S+\.\S+/i.test(value), {
    message: 'Must start with http:// or https://',
  });

export const MAX_HOOKS = 3;
export const MAX_TAGS = 8;
export const MAX_RELATIONS = 40;
export const MAX_LINEAGE = 24;

const draftSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(MAX.name, `Under ${MAX.name} characters`),
  alias: z.string().trim().max(MAX.alias, `Under ${MAX.alias} characters`),
  blurb: z.string().max(MAX.blurb, `Under ${MAX.blurb} characters`),
  quote: z.string().trim().max(MAX.quote, `Under ${MAX.quote} characters`),
  funFact: z.string().trim().max(MAX.funFact, `Under ${MAX.funFact} characters`),
  carrdUrl: urlish,
  voiceClaimUrl: urlish,
  imageSongUrl: urlish,
  genreTags: z.array(z.string().trim().min(1).max(MAX.tag)).max(MAX_TAGS, `At most ${MAX_TAGS} tags`),
  hooks: z
    .array(
      z.object({
        label: z.string().trim().max(MAX.hookLabel),
        body: z.string().trim().max(MAX.hookBody),
      }),
    )
    .max(MAX_HOOKS, `At most ${MAX_HOOKS} hooks`),
  relations: z
    .array(
      z.object({
        name: z.string().trim().max(MAX.relationName),
        badge: z.string().trim().max(MAX.relationBadge),
      }),
    )
    .max(MAX_RELATIONS, `At most ${MAX_RELATIONS} relationships`),
  lineage: z
    .array(z.object({ shard: z.string().trim().max(MAX.shard) }))
    .max(MAX_LINEAGE, `At most ${MAX_LINEAGE} soul nodes`),
});

export interface ValidationOptions {
  isNew: boolean;
  /** Ids already in the archive, so a new entry cannot collide with one. */
  existingIds?: ReadonlySet<string>;
  password?: string;
  passwordConfirm?: string;
}

export const MIN_PASSWORD = 8;

export function validateDraft(draft: EntryDraft, options: ValidationOptions): FieldErrors {
  const errors: FieldErrors = {};
  const result = draftSchema.safeParse(draft);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!errors[key]) errors[key] = issue.message;
      // Surface an array-level message on the array itself too.
      const root = issue.path[0];
      if (typeof root === 'string' && issue.path.length > 1 && !errors[root]) {
        errors[root] = errors[root] ?? undefined;
      }
    }
  }

  if (options.isNew) {
    const id = draft.id.trim();
    if (!id) {
      errors.id = 'An entry ID is required';
    } else if (!isValidId(id)) {
      errors.id = 'Lowercase letters, numbers and hyphens only';
    } else if (options.existingIds?.has(id)) {
      errors.id = 'That ID is already taken';
    }

    const password = options.password ?? '';
    if (!password) {
      errors.password = 'A password is required';
    } else if (password.length < MIN_PASSWORD) {
      errors.password = `At least ${MIN_PASSWORD} characters`;
    }
    if (password !== (options.passwordConfirm ?? '')) {
      errors.passwordConfirm = 'Passwords do not match';
    }
  }

  // A hook with a body and no label reads as an unlabelled block in the view.
  draft.hooks.forEach((hook, index) => {
    if (hook.body.trim() && !hook.label.trim()) {
      errors[`hooks.${index}.label`] = 'Give this hook a label';
    }
  });

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}
