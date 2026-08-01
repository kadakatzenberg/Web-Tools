/// <reference lib="webworker" />

/**
 * The force layout, off the main thread.
 *
 * v1 ran `simulation.tick(300)` synchronously on the main thread inside a
 * `setTimeout`. Three hundred ticks over three hundred nodes is roughly two
 * seconds of blocked event loop on a laptop and considerably worse on a
 * phone: no scrolling, no input, no repaint. The progress bar it showed
 * during that time could not have been real — nothing could paint — and
 * indeed it was not: `setProgress(100, "300 / 300")` was called once, after
 * the blocking call had already finished.
 *
 * Here the settling happens in a worker and positions stream back as they
 * improve, so the map fades in already moving and the page stays responsive
 * the entire time.
 */

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { radiusOf } from './graph';

interface WorkerNode extends SimulationNodeDatum {
  id: string;
  cluster: string;
  world: string;
  degree: number;
  homeX: number;
  homeY: number;
  population: number;
}

interface WorkerEdge {
  source: string;
  target: string;
  sameCluster: boolean;
  sameWorld: boolean;
}

/** Resolved form: d3 replaces the ids with the node objects in place. */
interface WorkerLink extends SimulationLinkDatum<WorkerNode> {
  source: WorkerNode;
  target: WorkerNode;
  sameCluster: boolean;
  sameWorld: boolean;
}

export interface LayoutRequest {
  type: 'start';
  nodes: Array<{
    id: string;
    cluster: string;
    world: string;
    degree: number;
    x: number;
    y: number;
    homeX: number;
    homeY: number;
    population: number;
  }>;
  edges: WorkerEdge[];
}

export type LayoutMessage =
  | { type: 'progress'; alpha: number; positions: Float32Array; ids: string[] }
  | { type: 'done'; positions: Float32Array; ids: string[] };

let simulation: Simulation<WorkerNode, undefined> | null = null;

self.onmessage = (event: MessageEvent<LayoutRequest | { type: 'stop' }>) => {
  const data = event.data;

  if (data.type === 'stop') {
    simulation?.stop();
    simulation = null;
    return;
  }

  if (data.type !== 'start') return;

  simulation?.stop();

  const nodes: WorkerNode[] = data.nodes.map((node) => ({ ...node }));
  const ids = nodes.map((node) => node.id);
  const index = new Map(nodes.map((node) => [node.id, node]));

  const links: WorkerLink[] = [];
  for (const edge of data.edges) {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    // An edge naming a node that is not in the graph is dropped rather than
    // handed to d3, which would otherwise throw on the missing id.
    if (!source || !target) continue;
    links.push({ source, target, sameCluster: edge.sameCluster, sameWorld: edge.sameWorld });
  }

  /**
   * Pull toward the era a soul belongs to.
   *
   * Strength is inverse to how crowded that era is: a cluster of three should
   * stay tight and legible, a cluster of sixty needs room for repulsion to
   * spread it out. Well-connected nodes are pulled slightly less, so hubs
   * drift toward the edges of their cluster and their threads stay readable.
   */
  const homeForce = (alpha: number) => {
    for (const node of nodes) {
      const crowd = node.population <= 3 ? 1.9 : 1 / (1 + Math.sqrt(node.population) * 0.3);
      const strength = Math.max(0.02, 0.2 * crowd - node.degree * 0.002);
      node.vx = (node.vx ?? 0) - (node.x! - node.homeX) * strength * alpha;
      node.vy = (node.vy ?? 0) - (node.y! - node.homeY) * strength * alpha;
    }
  };

  simulation = forceSimulation(nodes)
    .force('home', homeForce)
    .force(
      'link',
      forceLink<WorkerNode, WorkerLink>(links)
        .id((node) => node.id)
        // Same era: close enough to read as a group. Same world: a long
        // thread across the sub-ring. Across worlds: long enough that the two
        // clusters do not collapse into each other, because a soul shared
        // between reflections should look like a span, not a seam.
        .distance((link) => (link.sameCluster ? 96 : link.sameWorld ? 260 : 560))
        .strength((link) => {
          const base = link.sameCluster ? 0.36 : link.sameWorld ? 0.1 : 0.03;
          // Damped by the busiest end, so one hub with forty relationships
          // does not drag its whole cluster into a knot.
          const busiest = Math.max(link.source.degree, link.target.degree, 1);
          return base / Math.sqrt(busiest);
        }),
    )
    .force(
      'charge',
      forceManyBody<WorkerNode>()
        .strength((node) => {
          const crowd = node.population <= 3 ? 20 : Math.sqrt(node.population) * 78;
          return -380 - crowd - node.degree * node.degree * 5;
        })
        .distanceMax(1100)
        .theta(0.85),
    )
    .force(
      'collide',
      forceCollide<WorkerNode>((node) => radiusOf(node.degree) + 22)
        .strength(0.92)
        .iterations(2),
    )
    .alphaDecay(0.018)
    .velocityDecay(0.55)
    .stop();

  const positions = () => {
    const out = new Float32Array(nodes.length * 2);
    nodes.forEach((node, at) => {
      out[at * 2] = node.x ?? 0;
      out[at * 2 + 1] = node.y ?? 0;
    });
    return out;
  };

  /**
   * Tick in slices, posting between them. The worker has no rendering to
   * block, but slicing keeps each message recent rather than sending one
   * settled layout after a long silence — which is what lets the map animate
   * itself into place instead of appearing finished.
   */
  const SLICE = 8;
  const MAX_TICKS = 420;
  let ticks = 0;

  const run = () => {
    if (!simulation) return;

    for (let i = 0; i < SLICE && ticks < MAX_TICKS; i++, ticks++) {
      simulation.tick();
    }

    const snapshot = positions();
    if (ticks >= MAX_TICKS || simulation.alpha() < 0.012) {
      const message: LayoutMessage = { type: 'done', positions: snapshot, ids };
      self.postMessage(message, [snapshot.buffer]);
      simulation.stop();
      simulation = null;
      return;
    }

    const message: LayoutMessage = {
      type: 'progress',
      alpha: simulation.alpha(),
      positions: snapshot,
      ids,
    };
    self.postMessage(message, [snapshot.buffer]);

    setTimeout(run, 0);
  };

  run();
};
