/**
 * The taxonomy of the archive: worlds, eras, and the pigments that carry them.
 *
 * v1 spread this across five constants that had already drifted apart —
 * `WORLD_ERA_ORDER` listed `7U` under The Thirteenth while `WORLD_ERAS` (the
 * editor's dropdown) omitted it entirely, so an era you could see in the
 * sidebar could not be chosen in the form. `ERA_COLORS` meanwhile filed `7U`
 * with the Source blues, and the star map papered over the disagreement by
 * silently merging `7U` into `7A`.
 *
 * Everything is declared once here and derived. `7U` sits with The Source,
 * which is both what its pigment already said and what the fiction says: the
 * Seventh Umbral Era is the calamity that fell on the Source.
 *
 * The era lists are a *preferred ordering*, not a whitelist. Entries carrying
 * an era the taxonomy has never heard of still appear — they sort to the end
 * of their world rather than vanishing. The archive is written by its
 * community; it is allowed to know things this file does not.
 */

export interface World {
  /** Canonical name. What the reader sees and what URLs are built from. */
  readonly name: string;
  /**
   * Values that appear in the `reflection` slot of stored entries and resolve
   * to this world. The canonical name is always accepted; these are extra.
   */
  readonly aliases: readonly string[];
  /** The name offered in the editor, when it differs from the canonical one. */
  readonly authoredAs?: string;
  /** Era codes, in narrative order. */
  readonly eras: readonly string[];
  /** Ring position on the star map. */
  readonly ring: number;
  readonly color: string;
}

export interface Era {
  readonly code: string;
  readonly label: string;
  readonly color: string;
}

/* ── Eras ────────────────────────────────────────────────────────────────── */

export const ERAS: readonly Era[] = [
  // The Ancients — teal, the light before the sundering
  { code: 'DOP', label: 'Days of Paradise', color: '#20a8a0' },
  // The Source — blue
  { code: '5A', label: '5th Astral Era', color: '#8ab4e8' },
  { code: '7A', label: '7th Astral Era', color: '#6a9ad8' },
  { code: '7U', label: '7th Umbral Era', color: '#4a80c8' },
  { code: 'LM', label: 'Lungmen Era', color: '#2a508a' },
  { code: 'NK', label: 'Neo-Kugane Era', color: '#3a6aaa' },
  // The First — ivory, a world drowned in light
  { code: 'RON', label: 'Ronka Era', color: '#e8d8a0' },
  { code: 'NAB', label: 'Nabaath Era', color: '#f0e8c0' },
  { code: 'VOE', label: 'Voeburt Era', color: '#dce8e8' },
  { code: 'CRY', label: 'Crystarium Era', color: '#f8f0d8' },
  { code: 'HINF', label: 'Hinomoto Founding Era', color: '#e0d8b8' },
  { code: 'HIN', label: 'Hinomoto Era', color: '#ecdcb0' },
  // The Thirteenth — crimson, then the dark
  { code: 'PF', label: 'Pre-Fall', color: '#a02030' },
  { code: 'TV', label: 'The Void', color: '#5a0f18' },
  // The Ninth — violet
  { code: 'ALX', label: 'Alexandria Era', color: '#6030a0' },
  { code: 'EVK', label: 'Everkeep Era', color: '#a060e0' },
  // Tianxia — jade
  { code: 'SD', label: 'Shang Dynasty Era', color: '#2a9060' },
  // The Eleventh / Vana'diel — ember
  { code: 'CE2', label: 'Crystal Era', color: '#e07030' },
  // End of Time — the last gold
  { code: 'BC', label: 'Beyond Causality', color: '#d8c030' },
  // The Seven Hells — sulphur. No era has ever been recorded for it.
  { code: 'HELL', label: 'The Seven Hells', color: '#b8622a' },
];

const ERA_BY_CODE = new Map(ERAS.map((e) => [e.code, e]));

/* ── Worlds ──────────────────────────────────────────────────────────────── */

export const WORLDS: readonly World[] = [
  {
    name: 'The Ancients',
    authoredAs: 'The Unsundered World',
    aliases: ['The Unsundered World'],
    eras: ['DOP'],
    ring: 0,
    color: '#20a8a0',
  },
  { name: 'The Source', aliases: [], eras: ['5A', '7A', '7U', 'LM', 'NK'], ring: 1, color: '#4a80c8' },
  {
    name: 'The First',
    aliases: [],
    eras: ['RON', 'NAB', 'VOE', 'CRY', 'HINF', 'HIN'],
    ring: 2,
    color: '#f0e8c0',
  },
  { name: 'The Thirteenth', aliases: [], eras: ['PF', 'TV'], ring: 3, color: '#a02030' },
  { name: 'The Ninth', aliases: [], eras: ['ALX', 'EVK'], ring: 4, color: '#7030b0' },
  { name: 'The Eleventh', aliases: [], eras: ['CE2'], ring: 5, color: '#e07030' },
  { name: 'Tianxia', aliases: [], eras: ['SD'], ring: 6, color: '#2a9060' },
  { name: 'End of Time', aliases: [], eras: ['BC'], ring: 7, color: '#d8c030' },
  { name: "Vana'diel", aliases: [], eras: ['CE2'], ring: 8, color: '#e07030' },
  // Eight characters live here and v1 had never heard of it — it reached the
  // archive through the editor's "Other (custom)…" escape hatch and has been
  // rendering in fallback gold, unsorted, ever since.
  { name: 'The Seven Hells', aliases: [], eras: ['HELL'], ring: 9, color: '#b8622a' },
];

const WORLD_BY_KEY = new Map<string, World>();
for (const w of WORLDS) {
  WORLD_BY_KEY.set(w.name, w);
  for (const alias of w.aliases) WORLD_BY_KEY.set(alias, w);
}

/** Sidebar and legend order. */
export const WORLD_ORDER: readonly string[] = [
  'The Ancients',
  'The Source',
  'Tianxia',
  'The First',
  'The Ninth',
  'The Eleventh',
  'The Thirteenth',
  'The Seven Hells',
  'End of Time',
  "Vana'diel",
];

/** The names the editor offers, in the form they are stored. */
export const AUTHORABLE_WORLDS: readonly string[] = WORLDS.map((w) => w.authoredAs ?? w.name);

/** Worlds with exactly one era: the editor picks it and locks the control. */
export function fixedEraFor(authoredWorld: string): string | null {
  const world = WORLD_BY_KEY.get(authoredWorld);
  return world && world.eras.length === 1 ? (world.eras[0] ?? null) : null;
}

/* ── Lookups ─────────────────────────────────────────────────────────────── */

/** Resolve a stored `reflection` value to its canonical world name. */
export function worldOf(reflection: string | undefined | null): string {
  const raw = (reflection ?? '').trim();
  if (!raw) return UNKNOWN_WORLD;
  return WORLD_BY_KEY.get(raw)?.name ?? raw;
}

export const UNKNOWN_WORLD = 'Uncharted';

export function worldMeta(name: string): World | undefined {
  return WORLD_BY_KEY.get(name);
}

export function eraLabel(code: string | undefined | null): string {
  const raw = (code ?? '').trim();
  if (!raw) return '';
  return ERA_BY_CODE.get(raw)?.label ?? raw;
}

export function eraColor(code: string | undefined | null, fallback = '#c8a030'): string {
  return ERA_BY_CODE.get((code ?? '').trim())?.color ?? fallback;
}

export function worldColor(name: string, fallback = '#c8a030'): string {
  return WORLD_BY_KEY.get(name)?.color ?? fallback;
}

/**
 * Order a world's observed era codes: known ones in narrative order, then
 * anything the data carries that this file has never heard of.
 */
export function orderEras(world: string, observed: readonly string[]): string[] {
  const declared = WORLD_BY_KEY.get(world)?.eras ?? [];
  const seen = new Set(observed);
  const ordered = declared.filter((code) => seen.has(code));
  const extra = observed.filter((code) => !declared.includes(code)).sort();
  return [...ordered, ...extra];
}

/** Order canonical world names: declared order first, then the rest. */
export function orderWorlds(observed: readonly string[]): string[] {
  const seen = new Set(observed);
  const ordered = WORLD_ORDER.filter((name) => seen.has(name));
  const extra = observed.filter((name) => !WORLD_ORDER.includes(name)).sort();
  return [...ordered, ...extra];
}

/** Ring order for the star map, which reads outward from the sundering. */
export function ringIndex(world: string): number {
  return WORLD_BY_KEY.get(world)?.ring ?? 99;
}

/* ── Enumerations used by the editor and detail view ─────────────────────── */

export const GENDERS: ReadonlyArray<readonly [string, string]> = [
  ['M', 'Male, He/Him'],
  ['F', 'Female, She/Her'],
  ['NB', 'Non-binary, They/Them'],
];

export const ALIGNMENTS: ReadonlyArray<readonly [string, string]> = [
  ['LG', 'Lawful Good'],
  ['NG', 'Neutral Good'],
  ['CG', 'Chaotic Good'],
  ['LN', 'Lawful Neutral'],
  ['TN', 'True Neutral'],
  ['CN', 'Chaotic Neutral'],
  ['LE', 'Lawful Evil'],
  ['NE', 'Neutral Evil'],
  ['CE', 'Chaotic Evil'],
  ['SG', 'Stupid Good'],
];

export const GENRE_TAGS: readonly string[] = [
  'Horror',
  'Comedy',
  'Supernatural',
  'Epic',
  'Romance',
  'Tragedy',
  'Mystery',
  'Adventure',
  'Drama',
  'Thriller',
  'Slice of Life',
  'Mundane',
  'Mature',
];

const GENDER_MAP = new Map(GENDERS);
const ALIGNMENT_MAP = new Map(ALIGNMENTS);

export function genderLabel(code: string | undefined | null): string {
  const raw = (code ?? '').trim();
  return GENDER_MAP.get(raw) ?? raw;
}

export function alignmentLabel(code: string | undefined | null): string {
  const raw = (code ?? '').trim();
  return ALIGNMENT_MAP.get(raw) ?? raw;
}
