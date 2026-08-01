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
    name: 'Nachtigal',
    stats: stats('Kit', 'Voidsent', 'M', 'unknown', 'CE', '', 'The Thirteenth', 'TV'),
    relations: [['Nemeia', 'bound', 'voidbound-one']],
    genre_tags: ['Horror'],
    created_at: '2025-07-01T10:00:00Z',
    updated_at: '2026-03-12T10:00:00Z',
  },
  {
    id: 'seven-hells-warden',
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

const SUPABASE = 'https://srvqlrmefjyluocwtvkt.supabase.co';

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
let cachedPortrait: Buffer | null = null;

function portraitPng(): Buffer {
  if (cachedPortrait) return cachedPortrait;
  const size = 64;

  const raw = Buffer.alloc(size * (size * 3 + 1));
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const t = y / (size - 1);
      raw[at++] = Math.round(74 + t * 120); // r
      raw[at++] = Math.round(52 + t * 96); // g
      raw[at++] = Math.round(96 + t * 40); // b
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

  cachedPortrait = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return cachedPortrait;
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

export interface ArchiveMockOptions {
  /** Fail the list request, to exercise the failure path. */
  failList?: boolean;
  /** Return an empty archive. */
  empty?: boolean;
  /** Record every write attempt instead of performing one. */
  onWrite?: (name: string, body: unknown) => void;
}

/**
 * Intercept everything that would leave the machine.
 *
 * Portraits are answered with a generated PNG rather than being allowed
 * through, so the suite has no network dependency at all and image-load
 * behaviour is still exercised.
 */
export async function mockArchive(page: Page, options: ArchiveMockOptions = {}): Promise<void> {
  const rows = options.empty ? [] : ROWS;

  await page.route(`${SUPABASE}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.startsWith('/storage/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: portraitPng() });
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
