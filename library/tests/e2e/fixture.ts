import { deflateSync } from 'node:zlib';
import type { Page, Route } from '@playwright/test';

/**
 * A stand-in archive.
 *
 * Shaped from the real table: nine-element `stats` arrays, relations as
 * two- and three-element tuples, and the awkward rows that actually exist —
 * a world the taxonomy has never heard of (The Seven Hells), an era stored as
 * prose rather than a code, an entry with no portrait, an entry with no era,
 * and an apostrophe in a name.
 */

interface Row {
  id: string;
  name: string;
  alias?: string;
  blurb?: string;
  quote?: string;
  fun_fact?: string;
  carrd_url?: string;
  voice_claim?: string;
  voice_claim_url?: string;
  image_song?: string;
  image_song_url?: string;
  portrait_url?: string;
  stats: string[];
  relations?: unknown[];
  lineage?: unknown[];
  rp_hooks?: string[][];
  genre_tags?: string[];
  created_at: string;
  updated_at: string;
}

function stats(
  player = '',
  race = '',
  gender = '',
  age = '',
  alignment = '',
  affiliation = '',
  reflection = '',
  era = '',
  lineage = '',
): string[] {
  return [player, race, gender, age, alignment, affiliation, reflection, era, lineage];
}

const SUPABASE = 'https://srvqlrmefjyluocwtvkt.supabase.co';

export const ROWS: Row[] = [
  {
    id: 'kada-katzenberg',
    name: 'Kada Katzenberg',
    alias: 'The Black Cat',
    blurb: 'Keeper of the Hei Mao.\n\nShe has run the kitchen through three calamities and does not intend to stop for a fourth.',
    quote: 'Sit down. Eat something. Then tell me what you did.',
    fun_fact: 'Cannot whistle.',
    carrd_url: 'https://example.carrd.co/kada',
    voice_claim: 'A low, tired alto',
    image_song: 'Something with a cello',
    portrait_url: 'https://srvqlrmefjyluocwtvkt.supabase.co/storage/v1/object/public/portraits/a.png',
    stats: stats('Benz', 'Miqo’te', 'F', '31', 'CN', 'Hei Mao', 'The Source', '7A', 'First'),
    relations: [
      ['Ayer Kahjaa', 'sister', 'ayer-kahjaa'],
      ['Someone Unrecorded', 'owes a debt'],
    ],
    lineage: [
      ['First', '7A', 'Kada Katzenberg', 1, 'kada-katzenberg'],
      ['Second', 'CRY', 'Dawn Khihothe', 0, 'dawn-khihothe'],
    ],
    rp_hooks: [
      ['The Debt', 'Someone in Ul’dah is still owed, and she knows exactly who.'],
      ['The Kitchen', 'The back door is open to anyone who can hold a knife properly.'],
    ],
    genre_tags: ['Drama', 'Slice of Life', 'Mystery'],
    created_at: '2024-02-01T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
  },
  {
    id: 'ayer-kahjaa',
    name: "K'ahkujol Ayer",
    alias: 'Mad Dog Princess',
    blurb: 'Fights first. Has never once regretted it out loud.',
    quote: 'Try me.',
    portrait_url: '',
    stats: stats('Benz', 'Miqo’te', 'F', '27', 'CE', 'Hei Mao', 'The Source', 'LM'),
    relations: [['Kada Katzenberg', 'sister', 'kada-katzenberg']],
    rp_hooks: [['The Ring', 'She will take any fight offered, for money or for less.']],
    genre_tags: ['Horror', 'Thriller'],
    created_at: '2024-03-14T10:00:00Z',
    updated_at: '2026-06-02T10:00:00Z',
  },
  {
    id: 'dawn-khihothe',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/dawn-khihothe.png`,
    name: 'Dawn Khihothe',
    alias: 'The Lightwarden’s Clerk',
    blurb: 'Keeps the ledgers of a city that should not have survived.',
    stats: stats('Mira', 'Elezen', 'NB', '204', 'LN', 'The Crystarium', 'The First', 'CRY'),
    lineage: [
      ['First', '7A', 'Kada Katzenberg', 0, 'kada-katzenberg'],
      ['Second', 'CRY', 'Dawn Khihothe', 1, 'dawn-khihothe'],
    ],
    genre_tags: ['Drama', 'Epic'],
    created_at: '2024-05-02T10:00:00Z',
    updated_at: '2026-07-28T10:00:00Z',
  },
  {
    id: 'lux-veritas',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/lux-veritas.png`,
    name: 'Lux Veritas',
    alias: 'Envy’s Auditor',
    blurb: 'Solution Nine keeps its accounts in blood and she signs every page.',
    stats: stats('Rue', 'Hyur', 'F', '38', 'LE', 'EN-V Industries', 'The Ninth', 'EVK'),
    relations: [['Kada Katzenberg', 'adversary', 'kada-katzenberg']],
    genre_tags: ['Thriller', 'Mature'],
    created_at: '2025-01-11T10:00:00Z',
    updated_at: '2026-05-19T10:00:00Z',
  },
  {
    id: 'riven-alter',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/riven-alter.png`,
    name: 'Riven',
    alias: 'The Ender',
    blurb: 'Beyond causality there is only the work.',
    stats: stats('Sol', 'Au Ra', 'M', '—', 'TN', 'The Enders', 'End of Time', 'BC'),
    lineage: [['Third', 'BC', 'Riven', 1, 'riven-alter']],
    genre_tags: ['Epic', 'Tragedy'],
    created_at: '2025-04-20T10:00:00Z',
    updated_at: '2026-01-04T10:00:00Z',
  },
  {
    id: 'voidbound-one',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/voidbound-one.png`,
    name: 'Nemeia',
    alias: 'Of the Thirteenth',
    blurb: 'What came back was not what went in.',
    stats: stats('Kit', 'Voidsent', 'F', 'unknown', 'NE', '', 'The Thirteenth', 'TV'),
    relations: [['Nachtigal', 'bound', 'voidbound-two']],
    genre_tags: ['Horror', 'Supernatural'],
    created_at: '2025-06-30T10:00:00Z',
    updated_at: '2026-03-11T10:00:00Z',
  },
  {
    id: 'voidbound-two',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/voidbound-two.png`,
    name: 'Nachtigal',
    stats: stats('Kit', 'Voidsent', 'M', 'unknown', 'CE', '', 'The Thirteenth', 'TV'),
    relations: [['Nemeia', 'bound', 'voidbound-one']],
    genre_tags: ['Horror'],
    created_at: '2025-07-01T10:00:00Z',
    updated_at: '2026-03-12T10:00:00Z',
  },
  {
    id: 'seven-hells-warden',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/seven-hells-warden.png`,
    name: 'Barbatos',
    alias: 'Warden of the Fourth',
    blurb: 'A world the archive was never taught to expect.',
    // The Seven Hells with no era at all, exactly as eight live rows have it.
    stats: stats('Ash', 'Fiend', 'M', '—', 'LE', 'The Fourth Hell', 'The Seven Hells', ''),
    genre_tags: ['Supernatural', 'Mature'],
    created_at: '2025-09-09T10:00:00Z',
    updated_at: '2026-02-02T10:00:00Z',
  },
  {
    id: 'fifth-astral-relic',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/fifth-astral-relic.png`,
    name: 'Ythirn Vaelor',
    alias: 'Of an older calamity',
    // The era stored as prose rather than a code, as two live rows have it.
    stats: stats('Jo', 'Hyur', 'M', '—', 'NG', '', 'The Source', '5th Astral Era'),
    genre_tags: ['Mundane'],
    created_at: '2025-11-15T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'venat-echo',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/venat-echo.png`,
    name: 'Hythlodaeus',
    alias: 'Of the Bureau',
    blurb: 'Before the sundering, before any of it.',
    stats: stats('Ren', 'Ancient', 'M', '—', 'NG', 'Amaurot', 'The Unsundered World', 'DOP'),
    genre_tags: ['Epic'],
    created_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-07-30T10:00:00Z',
  },
  {
    id: 'tianxia-blade',
    portrait_url: `${SUPABASE}/storage/v1/object/public/portraits/tianxia-blade.png`,
    name: 'Ma Chenxu',
    alias: 'The Ninth Sword',
    blurb: 'Wulin remembers every debt of blood.',
    stats: stats('Wei', 'Human', 'M', '29', 'CN', 'Beiguo', 'Tianxia', 'SD'),
    genre_tags: ['Adventure', 'Drama'],
    created_at: '2026-02-14T10:00:00Z',
    updated_at: '2026-07-31T10:00:00Z',
  },
  {
    id: 'uncharted-soul',
    name: 'A Nameless Thing',
    // No reflection at all: collects under "Uncharted".
    stats: stats('', '', '', '', '', '', '', ''),
    created_at: '2026-03-03T10:00:00Z',
    updated_at: '2026-03-03T10:00:00Z',
  },
];


/**
 * A stand-in portrait, generated rather than pasted.
 *
 * The obvious move is a base64 "1×1 transparent PNG" copied from somewhere.
 * The one this file used first turned out to be a half-transparent *red*
 * pixel, which upscaled to a salmon rectangle and sat there in the screenshots
 * looking exactly like a rendering bug. Building the bytes here means the
 * fixture is what it says it is: a 64×64 vertical gradient, opaque, so the
 * portrait treatment filter and the fade-in are both visibly exercised.
 */
const portraitCache = new Map<number, Buffer>();

function hsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * A distinct portrait per entry.
 *
 * Seeded from the requested path, so every character gets a recognisably
 * different image. That matters for the star map: a single shared swatch
 * would light up all 300 nodes identically and prove nothing about whether
 * the atlas maps the right face to the right star.
 *
 * A hue, a darker ground, and an off-centre blob roughly where a head goes —
 * enough to tell tiles apart at a glance and to see top-anchored cropping
 * working.
 */
function portraitPng(seed = 0): Buffer {
  const cached = portraitCache.get(seed);
  if (cached) return cached;
  const size = 64;

  // A hue per seed, well spread by the golden angle.
  const hue = (seed * 137.508) % 360;
  const [hr, hg, hb] = hsl(hue, 0.55, 0.62);
  const [dr, dg, db] = hsl((hue + 28) % 360, 0.5, 0.22);

  const raw = Buffer.alloc(size * (size * 3 + 1));
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const t = y / (size - 1);
      // Ground: a vertical ramp from the dark tone to the hue.
      let r = dr + (hr - dr) * t;
      let g = dg + (hg - dg) * t;
      let b = db + (hb - db) * t;

      // A head-ish blob in the upper third, so top-anchored cropping is
      // visibly doing something.
      const dx = (x - size * 0.5) / (size * 0.26);
      const dy = (y - size * 0.34) / (size * 0.3);
      const head = Math.max(0, 1 - (dx * dx + dy * dy));
      r += (245 - r) * head * 0.8;
      g += (232 - g) * head * 0.8;
      b += (214 - b) * head * 0.8;

      raw[at++] = Math.round(Math.min(255, Math.max(0, r)));
      raw[at++] = Math.round(Math.min(255, Math.max(0, g)));
      raw[at++] = Math.round(Math.min(255, Math.max(0, b)));
    }
  }

  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  portraitCache.set(seed, png);
  return png;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A synthetic archive at the real thing's size.
 *
 * Three separate legibility failures reached the user because every check ran
 * against the twelve-row fixture below: too few labels, nebulae bright enough
 * to swallow the content, and connection lines lost in the glow. None of them
 * are visible at twelve sparse nodes. All of them are obvious at three hundred
 * clustered ones.
 *
 * Populations and the five-in-304 portrait gap are taken from the live table.
 */
export function bigArchive(count = 304): Row[] {
  const POPULATIONS: Array<[string, string, number]> = [
    ['The Source', '7A', 67], ['The Ninth', 'EVK', 33], ['Tianxia', 'SD', 33],
    ['The First', 'HIN', 25], ['The Unsundered World', 'DOP', 22], ['The First', 'CRY', 13],
    ['The First', 'VOE', 13], ['End of Time', 'BC', 12], ['The Source', 'NK', 11],
    ['The Ninth', 'ALX', 11], ['The Thirteenth', 'PF', 11], ['The First', 'RON', 9],
    ['The Source', 'LM', 9], ['The Thirteenth', 'TV', 9], ['The First', 'NAB', 8],
    ['The Seven Hells', '', 8], ['The Eleventh', 'CE2', 2], ['The First', 'HINF', 2],
    ['The Source', '5A', 2], ['The Source', '7U', 2],
  ];
  const FIRST = 'Kada Ayer Dawn Lux Riven Maja Noire Sato Loki Muu Astraea Amaterasu Barbatos Nemeia Peony Cocoa Silas Odenta Tafi Sienna'.split(' ');
  const LAST = 'Katzenberg Kahjaa Khihothe Veritas Alter Dotharl Sulie Oswell Carver Yasuda Flaiare Northglow Redhare Xique Amariyo'.split(' ');

  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const rows: Row[] = [];
  let n = 0;
  for (const [reflection, era, population] of POPULATIONS) {
    for (let i = 0; i < population && rows.length < count; i++) {
      const id = `soul-${n}`;
      rows.push({
        id,
        name: `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
        portrait_url:
          n % 61 === 0 ? '' : `${SUPABASE}/storage/v1/object/public/portraits/${id}.png`,
        stats: stats('Player', 'Miqo’te', 'F', '27', 'CN', 'Hei Mao', reflection, era, ''),
        relations: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
      n++;
    }
  }

  // Mostly local ties, a few reaching across, and a handful of hubs.
  const hubs = [0, 12, 40, 88, 140, 200, 260].filter((h) => h < rows.length);
  for (let i = 0; i < rows.length; i++) {
    const links = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < links; k++) {
      const target =
        rnd() < 0.22
          ? hubs[Math.floor(rnd() * hubs.length)]!
          : Math.max(0, Math.min(rows.length - 1, i + Math.floor((rnd() - 0.5) * 26)));
      if (target === i) continue;
      rows[i]!.relations!.push([rows[target]!.name, 'known to', rows[target]!.id]);
    }
  }
  return rows;
}

export interface ArchiveMockOptions {
  /** Fail the list request, to exercise the failure path. */
  failList?: boolean;
  /** Return an empty archive. */
  empty?: boolean;
  /** Record every write attempt instead of performing one. */
  onWrite?: (name: string, body: unknown) => void;
  /** Serve a synthetic archive of this size instead of the twelve-row set. */
  scale?: number;
}

/**
 * Intercept everything that would leave the machine.
 *
 * Portraits are answered with a generated PNG rather than being allowed
 * through, so the suite has no network dependency at all and image-load
 * behaviour is still exercised.
 */
export async function mockArchive(page: Page, options: ArchiveMockOptions = {}): Promise<void> {
  const rows = options.empty ? [] : options.scale ? bigArchive(options.scale) : ROWS;

  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith('/storage/')) {
      // Seeded from the path so each entry keeps its own face across reloads.
      let seed = 0;
      for (let i = 0; i < path.length; i++) seed = (seed * 31 + path.charCodeAt(i)) >>> 0;
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: portraitPng(seed % 997),
        headers: {
          // The star map uploads portraits into a WebGL texture, which taints
          // and throws without this. Real Supabase storage sends it.
          'access-control-allow-origin': '*',
        },
      });
      return;
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').pop() ?? '';
      let body: unknown = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        /* no body */
      }
      options.onWrite?.(name, body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return;
    }

    if (path.startsWith('/rest/v1/entries')) {
      if (options.failList) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'The archive is having a moment.' }),
        });
        return;
      }

      // A single-entry request, as the detail view makes.
      const idFilter = url.searchParams.get('id');
      if (idFilter?.startsWith('eq.')) {
        const id = decodeURIComponent(idFilter.slice(3));
        const found = rows.filter((row) => row.id === id);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(found),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: '[]' });
  });
}

/** Console errors and page exceptions, collected for assertion. */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}
