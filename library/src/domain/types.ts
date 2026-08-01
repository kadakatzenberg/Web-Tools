/**
 * The shape of an entry.
 *
 * The database stores four of these fields as positional arrays — `stats` is
 * nine untyped strings where index 6 means "reflection" and index 7 means
 * "era", and nothing anywhere says so. v1 read `s[6]` and `s[7]` in eleven
 * places across the file. One of them, in the star map, read `ae.stats[7]`
 * after having already copied it into a local, so a rename would have caught
 * ten sites and missed the eleventh.
 *
 * The wire format cannot change without a migration of live data, so it
 * stays. But it is decoded once at the edge (see `codec.ts`) and every line
 * of application code above that boundary works with names.
 */

/** The nine `stats` slots, in wire order. */
export const STAT_KEYS = [
  'player',
  'race',
  'gender',
  'age',
  'alignment',
  'affiliation',
  'reflection',
  'era',
  'lineage',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type Stats = Record<StatKey, string>;

/** Display labels for the stat block, parallel to STAT_KEYS. */
export const STAT_LABELS: Record<StatKey, string> = {
  player: 'Player',
  race: 'Race',
  gender: 'Gender',
  age: 'Age',
  alignment: 'Alignment',
  affiliation: 'Affiliation',
  reflection: 'Reflection',
  era: 'Era',
  lineage: 'Lineage',
};

export interface Relation {
  /** The name as written, which may not match any entry. */
  name: string;
  /** A free-text label: "sister", "rival", "owes a debt". */
  badge: string;
  /** Set when the relation resolves to another entry. */
  targetId: string | null;
}

export interface SoulNode {
  /** Which shard of the soul this is. */
  shard: string;
  /** Era code. */
  era: string;
  name: string;
  /** True for the node representing the entry being viewed. */
  isSelf: boolean;
  targetId: string | null;
}

export interface Hook {
  label: string;
  body: string;
}

export interface Entry {
  id: string;
  name: string;
  alias: string;
  blurb: string;
  quote: string;
  funFact: string;
  carrdUrl: string;
  voiceClaim: string;
  voiceClaimUrl: string;
  imageSong: string;
  imageSongUrl: string;
  portraitUrl: string;
  stats: Stats;
  relations: Relation[];
  lineage: SoulNode[];
  hooks: Hook[];
  genreTags: string[];
  createdAt: string;
  updatedAt: string;
}

/** The subset the grid needs. Fetching only this keeps the list request small. */
export type EntrySummary = Pick<
  Entry,
  'id' | 'name' | 'alias' | 'portraitUrl' | 'genreTags' | 'stats' | 'createdAt' | 'updatedAt'
>;

/** A draft being edited. `id` is only writable when the entry is new. */
export type EntryDraft = Omit<Entry, 'createdAt' | 'updatedAt'>;

export function emptyStats(): Stats {
  return {
    player: '',
    race: '',
    gender: '',
    age: '',
    alignment: '',
    affiliation: '',
    reflection: '',
    era: '',
    lineage: '',
  };
}

export function emptyDraft(): EntryDraft {
  return {
    id: '',
    name: '',
    alias: '',
    blurb: '',
    quote: '',
    funFact: '',
    carrdUrl: '',
    voiceClaim: '',
    voiceClaimUrl: '',
    imageSong: '',
    imageSongUrl: '',
    portraitUrl: '',
    stats: emptyStats(),
    relations: [],
    lineage: [],
    hooks: [],
    genreTags: [],
  };
}
