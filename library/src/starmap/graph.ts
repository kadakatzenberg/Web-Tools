/**
 * Turning the archive into a sky.
 *
 * Pure, so the layout can be checked without a GPU or a worker.
 */

import { eraColor, orderEras, ringIndex, worldColor, worldOf } from '@/domain/taxonomy';
import type { Entry } from '@/domain/types';

export interface GraphNode {
  id: string;
  name: string;
  world: string;
  era: string;
  cluster: string;
  colour: string;
  worldColour: string;
  portrait: string;
  degree: number;
  /** Seeded start position, so the sky is the same shape every time. */
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Both ends in the same era. */
  sameCluster: boolean;
  sameWorld: boolean;
  /** Both ends in the Void — the archive's one visually special relation. */
  voidbound: boolean;
}

export interface Cluster {
  key: string;
  world: string;
  era: string;
  x: number;
  y: number;
  colour: string;
  worldColour: string;
  population: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  /** Adjacency, for highlighting a selection. */
  neighbours: Map<string, Set<string>>;
}

/** Deterministic RNG: the same archive always produces the same sky. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box–Muller, for a scatter that clumps like a real cluster does. */
function gaussian(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function buildGraph(entries: readonly Entry[]): Graph {
  const random = rng(0x5eed1234);

  /* ── Cluster census ─────────────────────────────────────────────────── */

  const worldEras = new Map<string, Set<string>>();
  const population = new Map<string, number>();

  for (const entry of entries) {
    const world = worldOf(entry.stats.reflection);
    const era = entry.stats.era.trim();
    if (!worldEras.has(world)) worldEras.set(world, new Set());
    if (era) worldEras.get(world)!.add(era);
    const key = `${world}||${era}`;
    population.set(key, (population.get(key) ?? 0) + 1);
  }

  /* ── Worlds on a ring, sized by how much they carry ─────────────────── */

  const worlds = [...worldEras.keys()].sort((a, b) => ringIndex(a) - ringIndex(b));
  const slots = worlds.map((world) => Math.max(1, worldEras.get(world)!.size));
  const totalSlots = slots.reduce((sum, n) => sum + n, 0) || 1;

  const RING_RADIUS = 1000;
  const clusters: Cluster[] = [];
  const clusterByKey = new Map<string, Cluster>();

  let cursor = 0;
  worlds.forEach((world, index) => {
    const span = slots[index]!;
    const angle = ((cursor + span / 2) / totalSlots) * Math.PI * 2 - Math.PI / 2;
    cursor += span;

    const wx = Math.cos(angle) * RING_RADIUS;
    const wy = Math.sin(angle) * RING_RADIUS;
    const wColour = worldColor(world);

    const eras = orderEras(world, [...worldEras.get(world)!]);
    // A world whose entries have no era at all still needs one cluster.
    const keys = eras.length ? eras : [''];

    if (keys.length === 1) {
      const era = keys[0]!;
      const cluster: Cluster = {
        key: `${world}||${era}`,
        world,
        era,
        x: wx,
        y: wy,
        colour: eraColor(era, wColour),
        worldColour: wColour,
        population: population.get(`${world}||${era}`) ?? 0,
      };
      clusters.push(cluster);
      clusterByKey.set(cluster.key, cluster);
      return;
    }

    // Sub-ring: sized by era count and by the busiest era, so a world with
    // one crowded era does not overlap itself.
    const busiest = Math.max(...keys.map((era) => population.get(`${world}||${era}`) ?? 0));
    const subRadius = 190 + keys.length * 46 + Math.sqrt(busiest) * 26;

    keys.forEach((era, eraIndex) => {
      const wobble = (random() - 0.5) * 0.22;
      const subAngle = (eraIndex / keys.length) * Math.PI * 2 - Math.PI / 2 + wobble;
      const cluster: Cluster = {
        key: `${world}||${era}`,
        world,
        era,
        x: wx + Math.cos(subAngle) * subRadius,
        y: wy + Math.sin(subAngle) * subRadius,
        colour: eraColor(era, wColour),
        worldColour: wColour,
        population: population.get(`${world}||${era}`) ?? 0,
      };
      clusters.push(cluster);
      clusterByKey.set(cluster.key, cluster);
    });
  });

  /* ── Nodes ──────────────────────────────────────────────────────────── */

  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  const byName = new Map<string, GraphNode>();

  for (const entry of entries) {
    const world = worldOf(entry.stats.reflection);
    const era = entry.stats.era.trim();
    const key = `${world}||${era}`;
    const cluster = clusterByKey.get(key) ?? clusters[0];
    if (!cluster) continue;

    const pop = population.get(key) ?? 1;
    const sigma = Math.max(46, Math.sqrt(pop) * 34);
    // Per-entry seed, so a node lands in the same place across reloads.
    const local = rng(hashString(entry.id));

    const node: GraphNode = {
      id: entry.id,
      name: entry.name,
      world,
      era,
      cluster: cluster.key,
      colour: cluster.colour,
      worldColour: cluster.worldColour,
      portrait: entry.portraitUrl,
      degree: 0,
      x: cluster.x + gaussian(local) * sigma,
      y: cluster.y + gaussian(local) * sigma,
      vx: 0,
      vy: 0,
    };

    nodes.push(node);
    byId.set(node.id, node);
    const folded = entry.name.trim().toLowerCase();
    if (folded && !byName.has(folded)) byName.set(folded, node);
  }

  /* ── Edges ──────────────────────────────────────────────────────────── */

  const edges: GraphEdge[] = [];
  const neighbours = new Map<string, Set<string>>();
  const seen = new Set<string>();

  const connect = (a: GraphNode, b: GraphNode) => {
    if (a.id === b.id) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    edges.push({
      source: a.id,
      target: b.id,
      sameCluster: a.cluster === b.cluster,
      sameWorld: a.world === b.world,
      voidbound: a.era === 'TV' && b.era === 'TV',
    });

    a.degree += 1;
    b.degree += 1;
    if (!neighbours.has(a.id)) neighbours.set(a.id, new Set());
    if (!neighbours.has(b.id)) neighbours.set(b.id, new Set());
    neighbours.get(a.id)!.add(b.id);
    neighbours.get(b.id)!.add(a.id);
  };

  for (const entry of entries) {
    const from = byId.get(entry.id);
    if (!from) continue;

    for (const relation of entry.relations) {
      // Prefer the explicit link; fall back to matching on name, which is how
      // most of the older rows are joined.
      const to = relation.targetId
        ? byId.get(relation.targetId)
        : byName.get(relation.name.trim().toLowerCase());
      if (to) connect(from, to);
    }

    // Soul lineage is a relation too, and a more interesting one — it is the
    // only thing in the archive that crosses worlds by design. v1 drew none
    // of it, so the map showed the reflections as unconnected islands when
    // the entire premise is that they are the same souls.
    for (const node of entry.lineage) {
      const to = node.targetId
        ? byId.get(node.targetId)
        : byName.get(node.name.trim().toLowerCase());
      if (to) connect(from, to);
    }
  }

  for (const node of nodes) {
    if (!neighbours.has(node.id)) neighbours.set(node.id, new Set());
  }

  return { nodes, edges, clusters, neighbours };
}

/** Node radius from how connected it is. Hubs read as brighter, bigger stars. */
export function radiusOf(degree: number): number {
  return Math.min(26, Math.max(6, 6 + Math.sqrt(degree) * 4.6));
}

export function isHub(degree: number): boolean {
  return degree >= 8;
}
