import { describe, expect, it } from 'vitest';
import { isHub, radiusOf } from '@/starmap/graph';

/**
 * How connected a soul is, encoded as size, is the one thing the star map says
 * that a list cannot. It stopped saying it twice.
 *
 * First the curve saturated at degree 19, so everyone from the quiet middle of
 * the cast to the best-connected character in it drew identically. Then a
 * screen-space floor of 11px, added so portraits would be legible, clamped the
 * bottom of the range as well — at dpr 2 that is 22 device pixels, above what
 * most of the archive ever reaches, so every node on screen came out the same
 * size. The real archive runs 0 to 45 connections and none of it was visible.
 */
describe('radiusOf', () => {
  it('keeps separating across the whole range the archive actually uses', () => {
    // Measured from the live table: the busiest soul has 45 connections.
    const quiet = radiusOf(1);
    const middling = radiusOf(8);
    const busy = radiusOf(20);
    const hub = radiusOf(45);

    expect(quiet).toBeLessThan(middling);
    expect(middling).toBeLessThan(busy);
    expect(busy).toBeLessThan(hub);
  });

  it('spans a wide enough range to read as a difference', () => {
    // The old curve gave 10.6 to 26 — a 2.4x spread that, once a floor was
    // applied, collapsed to nothing.
    expect(radiusOf(45) / radiusOf(0)).toBeGreaterThan(5);
  });

  it('grows sublinearly, so hubs do not swamp everyone else', () => {
    // Degree is heavy-tailed; a linear map makes one node enormous.
    const step = (a: number, b: number) => radiusOf(b) - radiusOf(a);
    expect(step(1, 5)).toBeGreaterThan(step(30, 34));
  });

  it('gives an unconnected soul a real but small mark', () => {
    expect(radiusOf(0)).toBeGreaterThan(0);
    expect(radiusOf(0)).toBeLessThan(radiusOf(1));
  });

  it('never returns something unrenderable', () => {
    for (const degree of [0, 1, 2, 5, 13, 45, 200, 5000]) {
      const r = radiusOf(degree);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });
});

describe('isHub', () => {
  it('marks the well-connected, not the merely present', () => {
    expect(isHub(0)).toBe(false);
    expect(isHub(7)).toBe(false);
    expect(isHub(8)).toBe(true);
    expect(isHub(45)).toBe(true);
  });
});
