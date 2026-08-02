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
 * A ceiling on labels actually drawn, after collision culling.
 *
 * Collision culling does the real work — this only stops a pathological zoom
 * from spending a frame measuring text nobody asked for.
 */
const MAX_LABELS = 160;

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
     * Gather the candidates, then place as many as will fit without touching.
     *
     * A budget alone does not work at real density. With 304 souls settled into
     * clusters, the ninety best-connected names all land in the same crowded
     * middle and overprint each other into a grey mat, while the sparse outer
     * reaches stay blank — the worst of both. v1 dodged this by naming almost
     * nobody when zoomed out, which is why its screenshots look clean.
     *
     * Greedy placement in priority order solves it properly and needs no zoom
     * thresholds at all: important names win the space they need, crowded
     * regions thin themselves out, empty regions fill in, and zooming in makes
     * room so more appear. It is the standard cartographic approach and it is
     * the only one that behaves at both twelve entries and three hundred.
     */
    interface Candidate {
      node: Graph['nodes'][number];
      priority: number;
      x: number;
      y: number;
      radius: number;
      size: number;
      alpha: number;
      colour: string;
    }

    const candidates: Candidate[] = [];

    for (const node of this.graph.nodes) {
      const isSelected = node.id === selected;
      const isHovered = node.id === hovered;
      const isNeighbour = Boolean(neighbours?.has(node.id));
      const dimmed = Boolean(selected) && !isSelected && !isNeighbour;

      // A dimmed node is deliberately quiet; naming it fights the selection.
      if (dimmed && !isSelected && !isHovered) continue;

      /**
       * Who is *eligible* to be named, before anything is placed.
       *
       * Collision culling alone was not enough, and the screenshots showed why:
       * greedy placement fills whatever space exists, so at the fit zoom it
       * printed about a hundred and fifty names and the map disappeared under
       * its own labels. v1 printed six. The difference is not the placement
       * algorithm, it is that v1 gated on zoom first — only well-connected hubs
       * are named from far away, everyone is named up close.
       *
       * That gate is what makes zooming feel like it reveals something, rather
       * than just magnifying a wall of text. Placement still runs afterwards,
       * so crowded regions thin out instead of overprinting the way v1's did.
       */
      const eligible =
        isSelected ||
        isHovered ||
        scale > 1.2 ||
        (scale > 0.6 && node.degree >= 8) ||
        node.degree >= 12;
      if (!eligible) continue;

      const { x, y } = projectToScreen(node, camera, this.width, this.height);
      if (x < -180 || x > this.width + 180 || y < -70 || y > this.height + 70) continue;

      // Mirrors the vertex shader's disc sizing, so the label sits against the
      // radius the node is actually drawn at.
      // Must mirror the vertex shader exactly, floor included, or labels
      // detach from the nodes they belong to as the zoom changes.
      const radius = Math.min(78, Math.max(3, radiusOf(node.degree) * scale));

      const rank = this.rank.get(node.id) ?? Number.MAX_SAFE_INTEGER;
      const priority = isSelected ? 1e9 : isHovered ? 9e8 : isNeighbour ? 8e8 : -rank;

      candidates.push({
        node,
        priority,
        x,
        y,
        radius,
        size: clamp(radius * 0.66, 11, 20),
        alpha:
          (isSelected ? 1 : isHovered ? 0.98 : isNeighbour ? 0.94 : 0.86) * reveal,
        colour: isSelected ? '#ffe98a' : isHovered ? '#fff6dc' : node.colour,
      });
    }

    candidates.sort((a, b) => b.priority - a.priority);

    // Occupied boxes, bucketed so overlap testing stays cheap at any density.
    const CELL = 64;
    const columns = Math.ceil(this.width / CELL) + 2;
    const taken = new Map<number, Array<[number, number, number, number]>>();

    const fits = (left: number, top: number, right: number, bottom: number): boolean => {
      const c0 = Math.max(0, Math.floor(left / CELL));
      const c1 = Math.floor(right / CELL);
      const r0 = Math.max(0, Math.floor(top / CELL));
      const r1 = Math.floor(bottom / CELL);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const bucket = taken.get(r * columns + c);
          if (!bucket) continue;
          for (const [bl, bt, br, bb] of bucket) {
            if (left < br && right > bl && top < bb && bottom > bt) return false;
          }
        }
      }
      return true;
    };

    const occupy = (left: number, top: number, right: number, bottom: number): void => {
      const c0 = Math.max(0, Math.floor(left / CELL));
      const c1 = Math.floor(right / CELL);
      const r0 = Math.max(0, Math.floor(top / CELL));
      const r1 = Math.floor(bottom / CELL);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * columns + c;
          const bucket = taken.get(key);
          if (bucket) bucket.push([left, top, right, bottom]);
          else taken.set(key, [[left, top, right, bottom]]);
        }
      }
    };

    let placed = 0;

    for (const item of candidates) {
      if (placed >= MAX_LABELS) break;

      ctx.font = `600 ${item.size}px Cinzel, Georgia, serif`;
      const width = ctx.measureText(item.node.name).width;
      const top = item.y + item.radius + 4;
      const left = item.x - width / 2;

      // A little breathing room, so neighbours are separated rather than
      // merely not overlapping.
      const pad = 3;
      if (!fits(left - pad, top - pad, left + width + pad, top + item.size + pad)) continue;
      occupy(left - pad, top - pad, left + width + pad, top + item.size + pad);
      placed++;

      // Shadow first, in the same two-pass way v1 did it: a dark copy offset
      // by a pixel is what keeps a thin serif legible over a bright nebula.
      ctx.globalAlpha = item.alpha * 0.8;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      ctx.fillText(item.node.name, item.x + 1, top + 1);

      ctx.globalAlpha = item.alpha;
      ctx.fillStyle = item.colour;
      ctx.fillText(item.node.name, item.x, top);
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
