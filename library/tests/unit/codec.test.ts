import { describe, expect, it } from 'vitest';
import {
  decodeEntries,
  decodeEntry,
  encodeDraft,
  isValidId,
  normaliseId,
  safeUrl,
} from '@/domain/codec';
import { emptyDraft } from '@/domain/types';

describe('safeUrl', () => {
  it('keeps http and https', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects the schemes that make a stored link executable', () => {
    // v1 wrote these straight into href, so any author could ship script to
    // every visitor who opened their character.
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(safeUrl(' javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeUrl('file:///etc/passwd')).toBe('');
  });

  it('rejects schemeless input rather than guessing a scheme', () => {
    expect(safeUrl('example.com/x')).toBe('');
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl(42)).toBe('');
  });
});

describe('decodeEntry', () => {
  it('decodes the positional stats array to names', () => {
    const entry = decodeEntry({
      id: 'kada',
      name: 'Kada',
      stats: ['Benz', 'Miqo’te', 'F', '27', 'CN', 'Hei Mao', 'The Source', '7A', 'Kada'],
    });
    expect(entry.stats.player).toBe('Benz');
    expect(entry.stats.reflection).toBe('The Source');
    expect(entry.stats.era).toBe('7A');
    expect(entry.stats.affiliation).toBe('Hei Mao');
  });

  it('survives every shape the table actually contains', () => {
    expect(decodeEntry({}).name).toBe('');
    expect(decodeEntry({ stats: null }).stats.era).toBe('');
    expect(decodeEntry({ stats: 'nonsense' }).stats.era).toBe('');
    expect(decodeEntry({ stats: ['a', 'b'] }).stats.reflection).toBe('');
    expect(decodeEntry({ name: null, id: 'x' }).name).toBe('');
    expect(decodeEntry({ relations: [['Ayer', 'sister']] }).relations[0]).toEqual({
      name: 'Ayer',
      badge: 'sister',
      targetId: null,
    });
  });

  it('tolerates a relation stored as a bare string', () => {
    const entry = decodeEntry({ id: 'x', relations: ['Ayer'] });
    expect(entry.relations).toEqual([{ name: 'Ayer', badge: '', targetId: null }]);
  });

  it('drops relations and hooks that carry nothing', () => {
    const entry = decodeEntry({
      id: 'x',
      relations: [['', ''], ['Ayer', 'sister']],
      rp_hooks: [['', ''], ['The Debt', 'She owes him.']],
    });
    expect(entry.relations).toHaveLength(1);
    expect(entry.hooks).toHaveLength(1);
  });

  it('reads isSelf as the several things the table stores it as', () => {
    const rows = decodeEntry({
      id: 'x',
      lineage: [
        ['First', '7A', 'A', 1, ''],
        ['Second', 'TV', 'B', '1', ''],
        ['Third', 'PF', 'C', 0, ''],
        ['Fourth', 'PF', 'D', true, ''],
      ],
    }).lineage;
    expect(rows.map((node) => node.isSelf)).toEqual([true, true, false, true]);
  });

  it('falls back to created_at when a row has never been updated', () => {
    const entry = decodeEntry({ id: 'x', created_at: '2024-01-01T00:00:00Z' });
    expect(entry.updatedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('deduplicates genre tags', () => {
    expect(decodeEntry({ id: 'x', genre_tags: ['Horror', 'Horror', 'Epic'] }).genreTags).toEqual([
      'Horror',
      'Epic',
    ]);
  });
});

describe('decodeEntries', () => {
  it('drops rows with no id, since nothing can link to them', () => {
    const entries = decodeEntries([{ id: 'a', name: 'A' }, { name: 'B' }, null, 'junk']);
    expect(entries.map((entry) => entry.id)).toEqual(['a']);
  });

  it('returns an empty list for a non-array payload', () => {
    // PostgREST returns an object, not an array, when it errors.
    expect(decodeEntries({ message: 'permission denied' })).toEqual([]);
    expect(decodeEntries(null)).toEqual([]);
  });
});

describe('encodeDraft', () => {
  it('round-trips through the positional wire format', () => {
    const draft = emptyDraft();
    draft.name = 'Kada';
    draft.stats.reflection = 'The Source';
    draft.stats.era = '7A';
    draft.relations = [{ name: 'Ayer', badge: 'sister', targetId: 'ayer' }];
    draft.hooks = [{ label: 'The Debt', body: 'She owes him.' }];

    const wire = encodeDraft(draft);
    expect((wire.stats as string[])[6]).toBe('The Source');
    expect((wire.stats as string[])[7]).toBe('7A');
    expect(wire.relations).toEqual([['Ayer', 'sister', 'ayer']]);

    const back = decodeEntry({ id: 'kada', ...wire });
    expect(back.stats.reflection).toBe('The Source');
    expect(back.relations[0]?.targetId).toBe('ayer');
    expect(back.hooks[0]?.label).toBe('The Debt');
  });

  it('strips an unsafe url on the way out as well as in', () => {
    const draft = emptyDraft();
    draft.name = 'X';
    draft.carrdUrl = 'javascript:alert(1)';
    expect(encodeDraft(draft).carrd_url).toBe('');
  });
});

describe('normaliseId', () => {
  it('produces a URL-safe slug', () => {
    expect(normaliseId('Dawn Khihothe')).toBe('dawn-khihothe');
    expect(normaliseId("K'ahkujol")).toBe('kahkujol');
    expect(normaliseId('  Spaced   Out  ')).toBe('spaced-out');
    expect(normaliseId('under_score')).toBe('under-score');
    expect(normaliseId('--edges--')).toBe('edges');
  });

  it('removes the characters that would break a share link', () => {
    // v1 only replaced whitespace, so these reached the URL intact.
    expect(normaliseId('a/b?c#d')).toBe('abcd');
    expect(normaliseId('../../etc')).toBe('etc');
  });

  it('rejects ids that survived normalisation as empty', () => {
    expect(isValidId(normaliseId('???'))).toBe(false);
    expect(isValidId('valid-id-9')).toBe(true);
    expect(isValidId('-leading')).toBe(false);
    expect(isValidId('Has Capitals')).toBe(false);
  });
});
