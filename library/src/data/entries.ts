/**
 * The repository: the only place that knows column names or function names.
 */

import { decodeEntries, decodeEntry, encodeDraft } from '@/domain/codec';
import type { Entry, EntryDraft } from '@/domain/types';
import { ArchiveError, callFunction, selectRows, uploadObject } from './client';

/**
 * The grid needs seven columns. v1 asked for `select=*` and got the blurb, the
 * quote, every relation, the whole lineage and the password hash for all of
 * them — several hundred kilobytes to render a wall of names and faces.
 */
const SUMMARY_COLUMNS =
  'id,name,alias,portrait_url,genre_tags,stats,created_at,updated_at';

export async function fetchEntries(signal?: AbortSignal): Promise<Entry[]> {
  const rows = await selectRows(`entries?select=${SUMMARY_COLUMNS}&order=name.asc`, signal);
  return decodeEntries(rows);
}

export async function fetchEntry(id: string, signal?: AbortSignal): Promise<Entry | null> {
  const rows = await selectRows(
    `entries?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    signal,
  );
  const list = Array.isArray(rows) ? rows : [];
  const first = list[0];
  return first ? decodeEntry(first as Record<string, unknown>) : null;
}

export async function createEntry(
  draft: EntryDraft,
  password: string,
  signal?: AbortSignal,
): Promise<string> {
  const id = await callFunction(
    'create_entry',
    { p_id: draft.id, p_password: password, p_payload: encodeDraft(draft) },
    signal,
  );
  return typeof id === 'string' ? id : draft.id;
}

export async function updateEntry(
  draft: EntryDraft,
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  await callFunction(
    'update_entry',
    { p_id: draft.id, p_password: password, p_payload: encodeDraft(draft) },
    signal,
  );
}

export async function removeEntry(
  id: string,
  password: string,
  signal?: AbortSignal,
): Promise<void> {
  await callFunction('delete_entry', { p_id: id, p_password: password }, signal);
}

export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function describePortraitProblem(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Portraits must be JPEG, PNG, WebP or GIF.';
  }
  if (file.size > MAX_PORTRAIT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That file is ${mb}MB. The limit is 5MB.`;
  }
  return null;
}

export async function uploadPortrait(
  file: File,
  entryId: string,
  signal?: AbortSignal,
): Promise<string> {
  const problem = describePortraitProblem(file);
  if (problem) throw new ArchiveError('rejected', problem);

  // The extension comes from the MIME type rather than the filename, which a
  // browser will happily report as "image.php".
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${entryId}_portrait_${Date.now()}.${extension}`;
  return uploadObject('portraits', path, file, signal);
}
