/**
 * A seal for every soul.
 *
 * Each entry gets a mark derived from its id: a ring, a polygon, an inner
 * device, an orbit of points. The id never changes, so neither does the mark —
 * it is stable across sessions, devices and reloads without anything being
 * stored. No image is fetched; the whole thing is a few hundred bytes of SVG
 * geometry generated at render time.
 *
 * It earns its place four ways. Only five of the 304 entries currently lack a
 * portrait, but every one of the other 299 spends the first moments of its
 * life on screen as a grey box, and any of them becomes one permanently the
 * day a storage object goes missing — v1 rendered a broken-image icon in that
 * case. The mark is also what identifies a linked relation inline, where a
 * portrait would be too heavy, and what fills the placeholder while a real
 * portrait decodes. v1 used the same `✦` glyph for all of it.
 *
 * The vocabulary is deliberately narrow — rings, polygons, crescents, rays —
 * so that fifty of them on a grid read as one system rather than fifty
 * unrelated doodles.
 */

/** xmur3: a string to a well-distributed 32-bit seed. */
function seedFrom(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: small, fast, good enough for geometry. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SigilShape {
  kind: 'path' | 'circle';
  /** `d` for a path, unused for a circle. */
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  /** Stroke width in viewBox units, or 0 for a filled shape. */
  stroke: number;
  fill: boolean;
  /** 0–1, applied as opacity. */
  alpha: number;
  dash?: string;
}

export interface Sigil {
  /** Always 0 0 100 100. */
  shapes: SigilShape[];
  /** A stable hue offset in degrees, for tinting when no era colour applies. */
  hue: number;
}

const C = 50; // centre
const TAU = Math.PI * 2;

function polygonPath(sides: number, radius: number, rotation: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * TAU + rotation;
    points.push(`${(C + Math.cos(angle) * radius).toFixed(2)},${(C + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

/** A {n/step} star polygon — the pentagram family. */
function starPath(points: number, radius: number, step: number, rotation: number): string {
  const path: string[] = [];
  const visited = new Set<number>();
  let index = 0;
  for (let i = 0; i <= points; i++) {
    if (visited.has(index)) break;
    visited.add(index);
    const angle = (index / points) * TAU + rotation;
    const x = (C + Math.cos(angle) * radius).toFixed(2);
    const y = (C + Math.sin(angle) * radius).toFixed(2);
    path.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
    index = (index + step) % points;
  }
  return `${path.join('')}Z`;
}

function raysPath(count: number, inner: number, outer: number, rotation: number): string {
  const segments: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    segments.push(
      `M${(C + cos * inner).toFixed(2)},${(C + sin * inner).toFixed(2)}` +
        `L${(C + cos * outer).toFixed(2)},${(C + sin * outer).toFixed(2)}`,
    );
  }
  return segments.join('');
}

/** Two offset arcs: the crescent. */
function crescentPath(radius: number): string {
  const r2 = radius * 0.92;
  return (
    `M${C},${(C - radius).toFixed(2)}` +
    `A${radius},${radius} 0 1 0 ${C},${(C + radius).toFixed(2)}` +
    `A${r2},${r2} 0 1 1 ${C},${(C - radius).toFixed(2)}Z`
  );
}

type Device = 'star' | 'polygon' | 'crescent' | 'rays' | 'eye' | 'nested';

const DEVICES: Device[] = ['star', 'polygon', 'crescent', 'rays', 'eye', 'nested'];

export function sigilFor(id: string): Sigil {
  const random = rng(seedFrom(id || 'unknown'));
  const shapes: SigilShape[] = [];
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)] ?? list[0]!;
  const between = (min: number, max: number) => min + random() * (max - min);

  const hue = Math.floor(random() * 360);

  /* Outer ring — always present, so every mark shares a silhouette. */
  const outerR = between(38, 44);
  shapes.push({
    kind: 'circle',
    cx: C,
    cy: C,
    r: outerR,
    stroke: between(0.8, 1.6),
    fill: false,
    alpha: 0.55,
  });

  /* A second ring, sometimes broken, for texture. */
  if (random() < 0.62) {
    const gap = between(1.5, 4);
    shapes.push({
      kind: 'circle',
      cx: C,
      cy: C,
      r: outerR - between(3, 6),
      stroke: between(0.5, 1),
      fill: false,
      alpha: 0.34,
      dash: random() < 0.5 ? `${gap.toFixed(1)} ${(gap * 1.8).toFixed(1)}` : undefined,
    });
  }

  /* Tick marks around the rim: a compass rose, or an astrolabe's degrees. */
  if (random() < 0.7) {
    const ticks = Math.floor(between(8, 32));
    shapes.push({
      kind: 'path',
      d: raysPath(ticks, outerR - between(2.5, 5), outerR, random() * TAU),
      stroke: between(0.4, 0.9),
      fill: false,
      alpha: 0.4,
    });
  }

  /* The inner device. */
  const device = pick(DEVICES);
  const innerR = between(20, 29);
  const rotation = random() * TAU;

  switch (device) {
    case 'star': {
      const points = pick([5, 7, 7, 9, 11]);
      const step = points === 5 ? 2 : pick([2, 3]);
      shapes.push({
        kind: 'path',
        d: starPath(points, innerR, step, rotation),
        stroke: between(1, 1.8),
        fill: false,
        alpha: 0.9,
      });
      break;
    }
    case 'polygon': {
      const sides = pick([3, 3, 4, 5, 6, 8]);
      shapes.push({
        kind: 'path',
        d: polygonPath(sides, innerR, rotation),
        stroke: between(1, 1.8),
        fill: false,
        alpha: 0.9,
      });
      // A counter-rotated twin makes the hexagram / octagram.
      if (random() < 0.55) {
        shapes.push({
          kind: 'path',
          d: polygonPath(sides, innerR, rotation + Math.PI / sides),
          stroke: between(0.7, 1.3),
          fill: false,
          alpha: 0.5,
        });
      }
      break;
    }
    case 'crescent': {
      shapes.push({
        kind: 'path',
        d: crescentPath(innerR),
        stroke: 0,
        fill: true,
        alpha: 0.78,
      });
      break;
    }
    case 'rays': {
      const count = Math.floor(between(6, 14));
      shapes.push({
        kind: 'path',
        d: raysPath(count, between(6, 10), innerR, rotation),
        stroke: between(1, 1.7),
        fill: false,
        alpha: 0.82,
      });
      shapes.push({
        kind: 'circle',
        cx: C,
        cy: C,
        r: between(4, 7),
        stroke: 0,
        fill: true,
        alpha: 0.85,
      });
      break;
    }
    case 'eye': {
      const w = innerR;
      const h = innerR * between(0.42, 0.62);
      shapes.push({
        kind: 'path',
        d:
          `M${(C - w).toFixed(2)},${C}` +
          `Q${C},${(C - h).toFixed(2)} ${(C + w).toFixed(2)},${C}` +
          `Q${C},${(C + h).toFixed(2)} ${(C - w).toFixed(2)},${C}Z`,
        stroke: between(1, 1.6),
        fill: false,
        alpha: 0.85,
      });
      shapes.push({
        kind: 'circle',
        cx: C,
        cy: C,
        r: between(4.5, 7.5),
        stroke: 0,
        fill: true,
        alpha: 0.9,
      });
      break;
    }
    case 'nested': {
      let r = innerR;
      const rings = Math.floor(between(2, 5));
      for (let i = 0; i < rings; i++) {
        shapes.push({
          kind: 'circle',
          cx: C,
          cy: C,
          r,
          stroke: between(0.7, 1.4),
          fill: false,
          alpha: 0.8 - i * 0.13,
        });
        r *= between(0.58, 0.76);
      }
      break;
    }
  }

  /* An orbit of points: the mark's "signature", most varied part per id. */
  if (random() < 0.8) {
    const count = Math.floor(between(3, 9));
    const orbit = between(30, 36);
    const start = random() * TAU;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + start;
      shapes.push({
        kind: 'circle',
        cx: Number((C + Math.cos(angle) * orbit).toFixed(2)),
        cy: Number((C + Math.sin(angle) * orbit).toFixed(2)),
        r: between(0.9, 2.2),
        stroke: 0,
        fill: true,
        alpha: between(0.45, 0.85),
      });
    }
  }

  return { shapes, hue };
}
