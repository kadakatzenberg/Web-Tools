/**
 * The boundary between the wire format and the application.
 *
 * Everything the database hands back is untrusted: the table is written by a
 * community through a form, over years, by several versions of this app. Rows
 * carry `stats` arrays of length 4 and length 12, `relations` entries that are
 * bare strings instead of tuples, and nulls in places the original author
 * never expected. v1 read all of it positionally and unguarded, so a row with
 * a null `name` took down `applyFilter` for every other row on the page.
 *
 * Decoding is therefore total: any input produces a valid `Entry`, and
 * anything unreadable degrades to empty rather than throwing.
 */

import type { Entry, EntryDraft, Hook, Relation, SoulNode, Stats } from './types';
import { STAT_KEYS, emptyStats } from './types';

/** The row shape as PostgREST returns it. Every field is suspect. */
export interface EntryRow {
  id?: unknown;
  name?: unknown;
  alias?: unknown;
  blurb?: unknown;
  quote?: unknown;
  fun_fact?: unknown;
  carrd_url?: unknown;
  voice_claim?: unknown;
  voice_claim_url?: unknown;
  image_song?: unknown;
  image_song_url?: unknown;
  portrait_url?: unknown;
  stats?: unknown;
  relations?: unknown;
  lineage?: unknown;
  rp_hooks?: unknown;
  genre_tags?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Only `http:` and `https:` survive.
 *
 * v1 interpolated these straight into `href`, so `javascript:` in an entry's
 * Carrd field was stored XSS against every visitor who opened that character.
 * Escaping the attribute — which v1 did do — does not help, because the
 * payload is the URL scheme rather than the quoting.
 */
export function safeUrl(value: unknown): string {
  const raw = str(value).trim();
  if (!raw) return '';
  let parsed: URL;
  try {
    parsed = new URL(raw, 'https://example.invalid');
  } catch {
    return '';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  // A bare "example.com/x" resolves against the base and is not a real link.
  if (parsed.origin === 'https://example.invalid' && !/^https?:\/\//i.test(raw)) return '';
  return parsed.href;
}

function decodeStats(value: unknown): Stats {
  const source = arr(value);
  const stats = emptyStats();
  STAT_KEYS.forEach((key, index) => {
    stats[key] = str(source[index]).trim();
  });
  return stats;
}

function decodeRelations(value: unknown): Relation[] {
  return arr(value)
    .map((item): Relation => {
      // Tolerated legacy shape: a bare name with no badge.
      if (typeof item === 'string') return { name: item.trim(), badge: '', targetId: null };
      const tuple = arr(item);
      const targetId = str(tuple[2]).trim();
      return {
        name: str(tuple[0]).trim(),
        badge: str(tuple[1]).trim(),
        targetId: targetId || null,
      };
    })
    .filter((relation) => relation.name.length > 0);
}

function decodeLineage(value: unknown): SoulNode[] {
  return arr(value)
    .map((item): SoulNode => {
      const tuple = arr(item);
      const targetId = str(tuple[4]).trim();
      return {
        shard: str(tuple[0]).trim(),
        era: str(tuple[1]).trim(),
        name: str(tuple[2]).trim(),
        isSelf: tuple[3] === 1 || tuple[3] === true || tuple[3] === '1',
        targetId: targetId || null,
      };
    })
    .filter((node) => node.shard.length > 0 || node.name.length > 0);
}

function decodeHooks(value: unknown): Hook[] {
  return arr(value)
    .map((item): Hook => {
      const tuple = arr(item);
      return { label: str(tuple[0]).trim(), body: str(tuple[1]).trim() };
    })
    .filter((hook) => hook.label.length > 0 || hook.body.length > 0);
}

function decodeTags(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr(value)) {
    const tag = str(item).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function decodeEntry(row: EntryRow): Entry {
  return {
    id: str(row.id).trim(),
    name: str(row.name).trim(),
    alias: str(row.alias).trim(),
    blurb: str(row.blurb),
    quote: str(row.quote).trim(),
    funFact: str(row.fun_fact).trim(),
    carrdUrl: safeUrl(row.carrd_url),
    voiceClaim: str(row.voice_claim).trim(),
    voiceClaimUrl: safeUrl(row.voice_claim_url),
    imageSong: str(row.image_song).trim(),
    imageSongUrl: safeUrl(row.image_song_url),
    portraitUrl: safeUrl(row.portrait_url),
    stats: decodeStats(row.stats),
    relations: decodeRelations(row.relations),
    lineage: decodeLineage(row.lineage),
    hooks: decodeHooks(row.rp_hooks),
    genreTags: decodeTags(row.genre_tags),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at) || str(row.created_at),
  };
}

/** Rows that decode to no id are dropped: nothing can link to them. */
export function decodeEntries(rows: unknown): Entry[] {
  return arr(rows)
    .map((row) => decodeEntry((row ?? {}) as EntryRow))
    .filter((entry) => entry.id.length > 0);
}

/** Back to the wire format, for PATCH and POST. */
export function encodeDraft(draft: EntryDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    alias: draft.alias.trim(),
    blurb: draft.blurb.trim(),
    quote: draft.quote.trim(),
    fun_fact: draft.funFact.trim(),
    carrd_url: safeUrl(draft.carrdUrl),
    voice_claim: draft.voiceClaim.trim(),
    voice_claim_url: safeUrl(draft.voiceClaimUrl),
    image_song: draft.imageSong.trim(),
    image_song_url: safeUrl(draft.imageSongUrl),
    portrait_url: draft.portraitUrl,
    stats: STAT_KEYS.map((key) => draft.stats[key].trim()),
    relations: draft.relations
      .filter((relation) => relation.name.trim())
      .map((relation) =>
        relation.targetId
          ? [relation.name.trim(), relation.badge.trim(), relation.targetId]
          : [relation.name.trim(), relation.badge.trim()],
      ),
    lineage: draft.lineage
      .filter((node) => node.shard.trim())
      .map((node) => [
        node.shard.trim(),
        node.era,
        node.name.trim(),
        node.isSelf ? 1 : 0,
        node.targetId ?? '',
      ]),
    rp_hooks: draft.hooks
      .filter((hook) => hook.label.trim() || hook.body.trim())
      .map((hook) => [hook.label.trim(), hook.body.trim()]),
    genre_tags: draft.genreTags,
  };
}

/**
 * Entry ids are the URL. Anything that would need escaping, or that could be
 * read as a path segment, is rejected rather than mangled.
 */
export function normaliseId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}
