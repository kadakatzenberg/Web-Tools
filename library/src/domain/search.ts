/**
 * Filtering, ranking and faceting. Pure functions over decoded entries, so
 * the whole of it is unit-testable without a browser or a network.
 *
 * v1's search was `haystack.includes(query)` over a joined string. Two things
 * that cost it: a search for "kahkujol" could not find K'ahkujol, because the
 * apostrophe sat between the letters, and results came back in whatever order
 * the sort happened to be in, so an exact name match could land below thirty
 * entries that merely mentioned the name in a blurb. Both matter here — this
 * is a cast list for a roleplay community, and the apostrophe is load-bearing
 * in half the names in it.
 */

import type { Entry, EntrySummary } from './types';
import { UNKNOWN_WORLD, orderEras, orderWorlds, worldOf } from './taxonomy';

/**
 * Fold to a comparable form: lowercase, decomposed, stripped of combining
 * marks and of the punctuation FFXIV names are full of.
 *
 * "K'ahkujol" and "Kahkujol" fold together. So do "Y'shtola" / "Yshtola" and
 * "Nabaath Areng" / "nabaath-areng".
 */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´ʻ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenise(query: string): string[] {
  const folded = fold(query);
  return folded ? folded.split(' ').filter(Boolean) : [];
}

export interface Filters {
  world: string | null;
  era: string | null;
  tag: string | null;
  player: string | null;
  query: string;
}

export const NO_FILTERS: Filters = {
  world: null,
  era: null,
  tag: null,
  player: null,
  query: '',
};

export function isFiltered(filters: Filters): boolean {
  return Boolean(
    filters.world || filters.era || filters.tag || filters.player || filters.query.trim(),
  );
}

export type SortKey = 'alpha' | 'newest' | 'updated' | 'relevance';

/** Weighted fields. A hit in a name is worth thirty in a blurb. */
interface Field {
  readonly text: string;
  readonly weight: number;
}

function fieldsOf(entry: Entry | EntrySummary): Field[] {
  const full = entry as Entry;
  const fields: Field[] = [
    { text: entry.name, weight: 100 },
    { text: entry.alias, weight: 60 },
    { text: entry.stats.affiliation, weight: 30 },
    { text: entry.stats.race, weight: 20 },
    { text: entry.stats.player, weight: 20 },
    { text: entry.genreTags.join(' '), weight: 15 },
  ];
  if (typeof full.blurb === 'string') fields.push({ text: full.blurb, weight: 4 });
  if (typeof full.quote === 'string') fields.push({ text: full.quote, weight: 4 });
  if (Array.isArray(full.relations)) {
    fields.push({ text: full.relations.map((r) => r.name).join(' '), weight: 8 });
  }
  return fields;
}

/**
 * Every token must appear somewhere, which makes adding a word narrow the
 * result set rather than widen it. Score rewards where the token landed and
 * whether it started a word.
 */
export function score(entry: Entry | EntrySummary, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  const fields = fieldsOf(entry).map((field) => ({ ...field, folded: fold(field.text) }));
  let total = 0;

  for (const token of tokens) {
    let best = 0;
    for (const field of fields) {
      if (!field.folded) continue;
      const at = field.folded.indexOf(token);
      if (at < 0) continue;
      const atWordStart = at === 0 || field.folded[at - 1] === ' ';
      const isWholeField = field.folded === token;
      let value = field.weight;
      if (atWordStart) value *= 2;
      if (isWholeField) value *= 3;
      best = Math.max(best, value);
    }
    // A token nothing matched disqualifies the entry outright.
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function matchesFilters(entry: Entry | EntrySummary, filters: Filters): boolean {
  if (filters.world && worldOf(entry.stats.reflection) !== filters.world) return false;
  if (filters.era && entry.stats.era !== filters.era) return false;
  if (filters.tag && !entry.genreTags.includes(filters.tag)) return false;
  if (filters.player && entry.stats.player !== filters.player) return false;
  return true;
}

export interface Ranked<T> {
  entry: T;
  score: number;
}

function compareAlpha(a: EntrySummary, b: EntrySummary): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function time(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

export function selectEntries<T extends Entry | EntrySummary>(
  entries: readonly T[],
  filters: Filters,
  sort: SortKey,
): T[] {
  const tokens = tokenise(filters.query);
  const ranked: Ranked<T>[] = [];

  for (const entry of entries) {
    if (!matchesFilters(entry, filters)) continue;
    const value = tokens.length ? score(entry, tokens) : 1;
    if (value === 0) continue;
    ranked.push({ entry, score: value });
  }

  // Searching implies relevance order unless an explicit sort was chosen.
  const effective: SortKey = sort === 'relevance' && tokens.length === 0 ? 'alpha' : sort;

  ranked.sort((a, b) => {
    switch (effective) {
      case 'newest':
        return time(b.entry.createdAt) - time(a.entry.createdAt) || compareAlpha(a.entry, b.entry);
      case 'updated':
        return time(b.entry.updatedAt) - time(a.entry.updatedAt) || compareAlpha(a.entry, b.entry);
      case 'relevance':
        return b.score - a.score || compareAlpha(a.entry, b.entry);
      case 'alpha':
      default:
        return compareAlpha(a.entry, b.entry);
    }
  });

  return ranked.map((item) => item.entry);
}

/* ── Facets ──────────────────────────────────────────────────────────────── */

export interface EraFacet {
  code: string;
  count: number;
}

export interface WorldFacet {
  world: string;
  count: number;
  eras: EraFacet[];
}

/**
 * The sidebar, derived from the data rather than declared. v1 listed every
 * world in a constant and hid the ones with no entries, which meant the
 * sidebar silently disagreed with the archive whenever someone added a world
 * the constant had not been taught.
 */
export function buildFacets(entries: readonly (Entry | EntrySummary)[]): WorldFacet[] {
  const worlds = new Map<string, { count: number; eras: Map<string, number> }>();

  for (const entry of entries) {
    const world = worldOf(entry.stats.reflection);
    let bucket = worlds.get(world);
    if (!bucket) {
      bucket = { count: 0, eras: new Map() };
      worlds.set(world, bucket);
    }
    bucket.count += 1;
    const era = entry.stats.era.trim();
    if (era) bucket.eras.set(era, (bucket.eras.get(era) ?? 0) + 1);
  }

  return orderWorlds([...worlds.keys()]).map((world) => {
    const bucket = worlds.get(world)!;
    const codes = orderEras(world, [...bucket.eras.keys()]);
    return {
      world,
      count: bucket.count,
      eras: codes.map((code) => ({ code, count: bucket.eras.get(code) ?? 0 })),
    };
  });
}

export function collectTags(entries: readonly (Entry | EntrySummary)[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.genreTags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

export function isUncharted(world: string): boolean {
  return world === UNKNOWN_WORLD;
}
