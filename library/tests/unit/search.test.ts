import { describe, expect, it } from 'vitest';
import { decodeEntry } from '@/domain/codec';
import { NO_FILTERS, buildFacets, fold, selectEntries, tokenise } from '@/domain/search';
import type { Entry } from '@/domain/types';

function entry(
  id: string,
  name: string,
  overrides: Partial<{
    alias: string;
    blurb: string;
    reflection: string;
    era: string;
    player: string;
    affiliation: string;
    tags: string[];
    created: string;
    updated: string;
  }> = {},
): Entry {
  return decodeEntry({
    id,
    name,
    alias: overrides.alias ?? '',
    blurb: overrides.blurb ?? '',
    genre_tags: overrides.tags ?? [],
    created_at: overrides.created ?? '2024-01-01T00:00:00Z',
    updated_at: overrides.updated ?? '2024-01-01T00:00:00Z',
    stats: [
      overrides.player ?? '',
      '',
      '',
      '',
      '',
      overrides.affiliation ?? '',
      overrides.reflection ?? '',
      overrides.era ?? '',
      '',
    ],
  });
}

describe('fold', () => {
  it('folds the punctuation FFXIV names are built from', () => {
    expect(fold("K'ahkujol")).toBe('kahkujol');
    expect(fold('Y’shtola')).toBe('yshtola');
    expect(fold('Nabaath Areng')).toBe('nabaath areng');
  });

  it('folds diacritics', () => {
    expect(fold('Miqo’te')).toBe('miqote');
    expect(fold('Élodie')).toBe('elodie');
  });

  it('collapses separators so a slug matches a name', () => {
    expect(fold('dawn-khihothe')).toBe(fold('Dawn Khihothe'));
  });
});

describe('tokenise', () => {
  it('splits on anything that is not alphanumeric', () => {
    expect(tokenise("K'ahkujol, the Wanderer")).toEqual(['kahkujol', 'the', 'wanderer']);
    expect(tokenise('   ')).toEqual([]);
  });
});

describe('selectEntries', () => {
  const archive = [
    entry('kada', 'Kada Katzenberg', { affiliation: 'Hei Mao', reflection: 'The Source', era: '7A' }),
    entry('ayer', 'Ayer Kahjaa', { reflection: 'The Source', era: 'LM', tags: ['Horror'] }),
    entry('dawn', 'Dawn Khihothe', { reflection: 'The First', era: 'CRY' }),
    entry('mention', 'Someone Else', { blurb: 'They once met Kada in Ul’dah.' }),
  ];

  it('finds a name through its apostrophe', () => {
    const found = selectEntries(archive, { ...NO_FILTERS, query: 'kahjaa' }, 'relevance');
    expect(found.map((e) => e.id)).toEqual(['ayer']);
  });

  it('ranks a name match above a blurb mention', () => {
    // The whole reason ranking exists: v1 returned these in alphabetical
    // order, so "Someone Else" landed above the character actually named Kada.
    const found = selectEntries(archive, { ...NO_FILTERS, query: 'kada' }, 'relevance');
    expect(found[0]?.id).toBe('kada');
    expect(found.map((e) => e.id)).toContain('mention');
  });

  it('narrows as tokens are added', () => {
    const one = selectEntries(archive, { ...NO_FILTERS, query: 'kada' }, 'relevance');
    const two = selectEntries(archive, { ...NO_FILTERS, query: 'kada katzenberg' }, 'relevance');
    expect(two.length).toBeLessThan(one.length);
    expect(two.map((e) => e.id)).toEqual(['kada']);
  });

  it('returns nothing when a token matches nothing', () => {
    expect(selectEntries(archive, { ...NO_FILTERS, query: 'kada zzzz' }, 'relevance')).toEqual([]);
  });

  it('filters by world, era, tag and player independently', () => {
    expect(
      selectEntries(archive, { ...NO_FILTERS, world: 'The Source' }, 'alpha').map((e) => e.id),
    ).toEqual(['ayer', 'kada']);
    expect(selectEntries(archive, { ...NO_FILTERS, era: 'CRY' }, 'alpha').map((e) => e.id)).toEqual([
      'dawn',
    ]);
    expect(selectEntries(archive, { ...NO_FILTERS, tag: 'Horror' }, 'alpha').map((e) => e.id)).toEqual(
      ['ayer'],
    );
  });

  it('resolves the authored world name to its canonical one when filtering', () => {
    const ancients = [entry('venat', 'Venat', { reflection: 'The Unsundered World', era: 'DOP' })];
    expect(
      selectEntries(ancients, { ...NO_FILTERS, world: 'The Ancients' }, 'alpha').map((e) => e.id),
    ).toEqual(['venat']);
  });

  it('sorts alphabetically without regard to case', () => {
    const mixed = [entry('b', 'apple'), entry('a', 'Banana')];
    expect(selectEntries(mixed, NO_FILTERS, 'alpha').map((e) => e.name)).toEqual([
      'apple',
      'Banana',
    ]);
  });

  it('sorts by newest and by updated', () => {
    const dated = [
      entry('old', 'Old', { created: '2020-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z' }),
      entry('new', 'New', { created: '2025-01-01T00:00:00Z', updated: '2025-02-01T00:00:00Z' }),
    ];
    expect(selectEntries(dated, NO_FILTERS, 'newest').map((e) => e.id)).toEqual(['new', 'old']);
    expect(selectEntries(dated, NO_FILTERS, 'updated').map((e) => e.id)).toEqual(['old', 'new']);
  });

  it('falls back to alphabetical when relevance is asked for with no query', () => {
    expect(selectEntries(archive, NO_FILTERS, 'relevance').map((e) => e.id)).toEqual([
      'ayer',
      'dawn',
      'kada',
      'mention',
    ]);
  });

  it('does not crash on an unparseable timestamp', () => {
    const broken = [entry('x', 'X', { created: 'not a date' })];
    expect(() => selectEntries(broken, NO_FILTERS, 'newest')).not.toThrow();
  });
});

describe('buildFacets', () => {
  it('counts worlds and their eras, in narrative order', () => {
    const facets = buildFacets([
      entry('a', 'A', { reflection: 'The Source', era: 'NK' }),
      entry('b', 'B', { reflection: 'The Source', era: '7A' }),
      entry('c', 'C', { reflection: 'The Source', era: '7A' }),
      entry('d', 'D', { reflection: 'The First', era: 'CRY' }),
    ]);
    const source = facets.find((facet) => facet.world === 'The Source')!;
    expect(source.count).toBe(3);
    // 7A precedes NK in the taxonomy regardless of insertion order.
    expect(source.eras).toEqual([
      { code: '7A', count: 2 },
      { code: 'NK', count: 1 },
    ]);
  });

  it('surfaces an era the taxonomy has never heard of instead of hiding it', () => {
    const facets = buildFacets([entry('a', 'A', { reflection: 'The Source', era: 'ZZZ' })]);
    expect(facets[0]?.eras).toEqual([{ code: 'ZZZ', count: 1 }]);
  });

  it('collects entries with no reflection under one heading', () => {
    const facets = buildFacets([entry('a', 'A'), entry('b', 'B')]);
    expect(facets).toEqual([{ world: 'Uncharted', count: 2, eras: [] }]);
  });
});
