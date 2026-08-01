/**
 * Names on the star map.
 *
 * v1 drew a label under every visible star with `ctx.fillText`, twice — once
 * in black at a one-pixel offset, once in the era's colour — so a name stayed
 * readable over a bright nebula. Losing that in the WebGL rewrite turned an
 * archive of people into a scatter plot: you could see that there were 304 of
 * something and not one of them was anybody.
 *
 * They come back on a 2D canvas layered over the GL one rather than as a glyph
 * atlas inside the shader. Text is the one thing a 2D context is genuinely
 * better at: it gets real hinting, real kerning, the browser's font stack and
 * crisp sub-pixel rendering at any zoom, for a few hundred `fillText` calls a
 * frame — and only for the labels actually on screen, which is a few dozen.
 *
 * The pass runs *after* bloom, which is deliberate. Bloomed text is unreadable
 * mush, and text that does not bloom is what tells a reader it is an interface
 * label rather than part of the sky.
 */

import { type Graph, radiusOf } from './graph';
import type { Camera } from './renderer';

/**
 * How many names are on screen at the widest view.
 *
 * Enough that the constellation reads as a cast list; few enough that they do
 * not collide into a grey mat. Tuned against the real archive's 304 entries.
 */
const LABEL_BUDGET = 40;

export interface LabelState {
  camera: Camera;
  selected: string | null;
  hovered: string | null;
  reveal: number;
}

/**
 * World position to canvas pixels.
 *
 * Pulled out as a pure function because the flip below is the kind of mistake
 * that survives being looked at. World space is y-up — that is what the vertex
 * shader's NDC conversion expects and what `toWorld` in StarMap.tsx assumes —
 * while a 2D canvas is y-down, so the vertical axis has to be inverted here.
 *
 * Getting it wrong mirrors every label about the horizontal centre line, which
 * does not look like a mirror. It looks like a random per-node offset, because
 * the labels nearest mid-height land almost exactly right. It took a debug
 * crosshair to see it.
 */
export function projectToScreen(
  world: { x: number; y: number },
  camera: Camera,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: world.x * camera.scale + camera.x + width / 2,
    y: height / 2 - (world.y * camera.scale + camera.y),
  };
}

export class LabelLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: Graph;
  private dpr = 1;
  private width = 1;
  private height = 1;

  /** Node id → position in the degree ranking. Fixed for the map's lifetime. */
  private rank: Map<string, number>;

  constructor(canvas: HTMLCanvasElement, graph: Graph) {
    this.canvas = canvas;
    this.graph = graph;
    this.rank = new Map(
      [...graph.nodes]
        .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
        .map((node, index) => [node.id, index]),
    );
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not open a 2D context for star map labels');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = Math.max(1, cssWidth);
    this.height = Math.max(1, cssHeight);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  draw(state: LabelState): void {
    const ctx = this.ctx;
    const { camera, selected, hovered, reveal } = state;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (reveal <= 0.01) return;

    const neighbours = selected ? this.graph.neighbours.get(selected) : undefined;
    const scale = camera.scale;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';


    /**
     * Which names are worth the ink.
     *
     * Showing all 304 at once is illegible and showing none is useless, so
     * the threshold moves with the zoom, exactly as v1's did: hubs carry
     * their names from far out, everyone else earns one as you come closer.
     * The selection and whatever is under the cursor are always named.
     */
    for (const node of this.graph.nodes) {
      const isSelected = node.id === selected;
      const isHovered = node.id === hovered;
      const isNeighbour = Boolean(neighbours?.has(node.id));
      const dimmed = Boolean(selected) && !isSelected && !isNeighbour;

      const screenRadius = Math.min(46, Math.max(node.portrait ? 9 : 4.5, radiusOf(node.degree) * scale));

      /**
       * Whether this name is worth the ink.
       *
       * Two earlier attempts gated on absolute zoom — v1's thresholds, then
       * looser ones — and both were wrong in the same way. The zoom the map
       * opens at is whatever `frameAll` needs to fit the layout, and that
       * depends on how many souls there are and how far the simulation spread
       * them. Measured here it was 0.40, below every threshold, so the map
       * opened naming nobody; and a *larger* archive settles wider, so the
       * real 304-entry version would have named even fewer. The number was
       * never the point.
       *
       * So: rank, and rendered size. The best-connected names are always
       * legible, however far out the reader is, and everyone else earns a
       * label once their star is actually big enough to sit under one.
       */
      const rank = this.rank.get(node.id) ?? Number.MAX_SAFE_INTEGER;
      const visible =
        isSelected ||
        isHovered ||
        (!dimmed && (rank < LABEL_BUDGET || screenRadius >= 10 || isNeighbour));

      if (!visible) continue;

      const { x, y } = projectToScreen(node, camera, this.width, this.height);

      // Cull generously — a label whose anchor is just off screen may still
      // have half its text on it.
      if (x < -160 || x > this.width + 160 || y < -60 || y > this.height + 60) continue;

      const size = clamp(screenRadius * 0.72, 11, 17);

      ctx.font = `600 ${size}px Cinzel, Georgia, serif`;

      const alpha =
        (isSelected ? 1 : isHovered ? 0.98 : isNeighbour ? 0.9 : dimmed ? 0.16 : 0.82) * reveal;
      const top = y + screenRadius + 5;

      // Shadow first, in the same two-pass way v1 did it: a dark copy offset
      // by a pixel is what keeps a thin serif legible over a bright nebula.
      ctx.globalAlpha = alpha * 0.75;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillText(node.name, x + 1, top + 1);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = isSelected ? '#ffe98a' : isHovered ? '#fff6dc' : node.colour;
      ctx.fillText(node.name, x, top);
    }

    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
