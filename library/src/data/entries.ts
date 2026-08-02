/**
 * The repository: the only place that knows column names or function names.
 */

import { decodeEntries, decodeEntry, encodeDraft } from '@/domain/codec';
import type { Entry, EntryDraft } from '@/domain/types';
import { ArchiveError, callFunction, selectRows, uploadObject } from './client';

/**
 * v1 asked for `select=*` and got the blurb, the quote, the whole lineage and
 * the password hash for every row — several hundred kilobytes to render a wall
 * of names and faces. Trimming that was right.
 *
 * `relations` must stay, and the reason is worth writing down because dropping
 * it cost five rounds of the star map being wrong in three different-looking
 * ways at once. The map builds its graph from this same list, so without this
 * column every entry arrives with no relations, which means no edges, which
 * means every node has degree zero — and degree is what drives node size. The
 * visible result was no connecting lines, every star identical, and no
 * portraits (a degree-zero node clamps to the size floor, below the threshold
 * where a face is legible). One missing column, three symptoms, none of which
 * point back here.
 *
 * It survived because the test mock answered every request with whole rows
 * regardless of `select`, so the column list was the one thing no test could
 * see. The mock now honours it.
 */
const SUMMARY_COLUMNS =
  'id,name,alias,portrait_url,genre_tags,stats,relations,lineage,created_at,updated_at';

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
