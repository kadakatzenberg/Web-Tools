import { describe, expect, it } from 'vitest';
import { sigilFor } from '@/domain/sigil';

describe('sigilFor', () => {
  it('is deterministic, so a character keeps its mark forever', () => {
    const a = sigilFor('dawn-khihothe');
    const b = sigilFor('dawn-khihothe');
    expect(a).toEqual(b);
  });

  it('gives different ids different marks', () => {
    const ids = ['kada', 'ayer', 'dawn', 'lux', 'riven', 'linden', 'maja', 'hotaru'];
    const rendered = ids.map((id) => JSON.stringify(sigilFor(id)));
    expect(new Set(rendered).size).toBe(ids.length);
  });

  it('always draws the outer ring, so the set reads as one system', () => {
    for (const id of ['a', 'b', 'zzz', 'a-very-long-entry-id-here']) {
      const [first] = sigilFor(id).shapes;
      expect(first?.kind).toBe('circle');
      expect(first?.r).toBeGreaterThan(30);
    }
  });

  it('produces finite geometry for every id it is given', () => {
    for (let i = 0; i < 400; i++) {
      const sigil = sigilFor(`entry-${i}`);
      expect(sigil.shapes.length).toBeGreaterThan(0);
      expect(sigil.hue).toBeGreaterThanOrEqual(0);
      expect(sigil.hue).toBeLessThan(360);
      for (const shape of sigil.shapes) {
        if (shape.kind === 'circle') {
          expect(Number.isFinite(shape.cx)).toBe(true);
          expect(Number.isFinite(shape.cy)).toBe(true);
          expect(Number.isFinite(shape.r)).toBe(true);
          expect(shape.r).toBeGreaterThan(0);
        } else {
          expect(shape.d).toBeTruthy();
          expect(shape.d).not.toMatch(/NaN|Infinity|undefined/);
        }
        expect(shape.alpha).toBeGreaterThan(0);
        expect(shape.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not throw on an empty id', () => {
    expect(() => sigilFor('')).not.toThrow();
  });
});
