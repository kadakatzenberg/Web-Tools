import { describe, expect, it } from 'vitest';
import {
  AUTHORABLE_WORLDS,
  ERAS,
  WORLDS,
  eraColor,
  eraLabel,
  fixedEraFor,
  orderEras,
  orderWorlds,
  worldOf,
} from '@/domain/taxonomy';

describe('taxonomy integrity', () => {
  it('declares no duplicate era codes', () => {
    const codes = ERAS.map((era) => era.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('declares no duplicate world names or aliases', () => {
    const keys = WORLDS.flatMap((world) => [world.name, ...world.aliases]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('references only eras that exist', () => {
    const known = new Set(ERAS.map((era) => era.code));
    for (const world of WORLDS) {
      for (const code of world.eras) {
        expect(known, `${world.name} references ${code}`).toContain(code);
      }
    }
  });

  it('gives every era a home', () => {
    // v1 could not have passed this: 7U was listed under The Thirteenth in one
    // constant, omitted from the editor's list in another, and coloured as a
    // Source era in a third.
    const placed = new Set(WORLDS.flatMap((world) => world.eras));
    for (const era of ERAS) {
      expect(placed, `${era.code} belongs to no world`).toContain(era.code);
    }
  });

  it('offers every world in the editor', () => {
    expect(AUTHORABLE_WORLDS).toHaveLength(WORLDS.length);
    expect(AUTHORABLE_WORLDS).toContain('The Unsundered World');
    expect(AUTHORABLE_WORLDS).not.toContain('The Ancients');
  });
});

describe('worldOf', () => {
  it('resolves the authored alias to the canonical name', () => {
    expect(worldOf('The Unsundered World')).toBe('The Ancients');
    expect(worldOf('The Ancients')).toBe('The Ancients');
  });

  it('passes an unknown world through rather than losing it', () => {
    expect(worldOf('The Fourteenth')).toBe('The Fourteenth');
  });

  it('collects the blank ones somewhere findable', () => {
    expect(worldOf('')).toBe('Uncharted');
    expect(worldOf(null)).toBe('Uncharted');
    expect(worldOf(undefined)).toBe('Uncharted');
  });
});

describe('ordering', () => {
  it('puts declared eras in narrative order and unknown ones last', () => {
    expect(orderEras('The Source', ['NK', 'ZZZ', '7A', 'LM'])).toEqual(['7A', 'LM', 'NK', 'ZZZ']);
  });

  it('orders worlds by the declared reading order', () => {
    expect(orderWorlds(['The First', 'The Ancients', 'Tianxia'])).toEqual([
      'The Ancients',
      'Tianxia',
      'The First',
    ]);
  });

  it('appends worlds the taxonomy does not know', () => {
    expect(orderWorlds(['Nowhere', 'The Source'])).toEqual(['The Source', 'Nowhere']);
  });
});

describe('fixedEraFor', () => {
  it('locks the era for single-era worlds', () => {
    expect(fixedEraFor('The Unsundered World')).toBe('DOP');
    expect(fixedEraFor('Tianxia')).toBe('SD');
    expect(fixedEraFor('End of Time')).toBe('BC');
  });

  it('leaves multi-era worlds open', () => {
    expect(fixedEraFor('The Source')).toBeNull();
    expect(fixedEraFor('The First')).toBeNull();
  });
});

describe('labels and pigments', () => {
  it('expands known era codes and passes unknown ones through', () => {
    expect(eraLabel('CRY')).toBe('Crystarium Era');
    expect(eraLabel('ZZZ')).toBe('ZZZ');
    expect(eraLabel('')).toBe('');
  });

  it('gives every era a colour and falls back for the rest', () => {
    for (const era of ERAS) expect(eraColor(era.code)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(eraColor('ZZZ', '#123456')).toBe('#123456');
  });
});
