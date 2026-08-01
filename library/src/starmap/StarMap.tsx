import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/app/hooks';
import { eraLabel, worldColor } from '@/domain/taxonomy';
import type { Entry } from '@/domain/types';
import { Glyph, Portrait } from '@/ui/Primitives';
import { buildGraph, radiusOf } from './graph';
import type { LayoutMessage } from './layout.worker';
import { type Camera, StarMapRenderer } from './renderer';
import './starmap.css';

interface StarMapProps {
  entries: Entry[];
  loading: boolean;
  onClose: () => void;
  onOpenEntry: (id: string) => void;
}

const MIN_SCALE = 0.06;
const MAX_SCALE = 4;
/** Below this a pointer press counts as a click rather than a drag. */
const DRAG_SLOP = 6;

export default function StarMap({ entries, loading, onClose, onOpenEntry }: StarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<StarMapRenderer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef(0);

  const reducedMotion = usePrefersReducedMotion();

  const graph = useMemo(() => (entries.length ? buildGraph(entries) : null), [entries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [settling, setSettling] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  // Mutable state the render loop reads without re-rendering React.
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 0.35 });
  const reveal = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const size = useRef({ width: 1, height: 1 });

  selectedRef.current = selected;
  hoveredRef.current = hovered;

  /* ── Camera helpers ───────────────────────────────────────────────────── */

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Centred, y-up, matching the shader's convention.
    const cx = clientX - rect.left - rect.width / 2;
    const cy = rect.height / 2 - (clientY - rect.top);
    const cam = camera.current;
    return { x: (cx - cam.x) / cam.scale, y: (cy - cam.y) / cam.scale };
  }, []);

  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (!graph) return null;
      const world = toWorld(clientX, clientY);
      const scale = camera.current.scale;
      let best: string | null = null;
      let bestDistance = Infinity;

      for (const node of graph.nodes) {
        // The touch target is the star's on-screen size with a floor, so a
        // faint star is still tappable when zoomed out.
        const screenRadius = Math.max(14, radiusOf(node.degree) * scale) / scale;
        const dx = node.x - world.x;
        const dy = node.y - world.y;
        const distance = dx * dx + dy * dy;
        if (distance <= screenRadius * screenRadius && distance < bestDistance) {
          bestDistance = distance;
          best = node.id;
        }
      }
      return best;
    },
    [graph, toWorld],
  );

  const frameAll = useCallback(() => {
    if (!graph || graph.nodes.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of graph.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
    const { width, height } = size.current;
    const spanX = Math.max(1, maxX - minX + 260);
    const spanY = Math.max(1, maxY - minY + 260);
    const scale = Math.min(MAX_SCALE, Math.min(width / spanX, height / spanY));
    camera.current = {
      scale: Math.max(MIN_SCALE, scale),
      x: -((minX + maxX) / 2) * scale,
      y: -((minY + maxY) / 2) * scale,
    };
  }, [graph]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = rect.height / 2 - (clientY - rect.top);
    const cam = camera.current;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor));
    // Keep whatever is under the cursor under the cursor.
    const worldX = (cx - cam.x) / cam.scale;
    const worldY = (cy - cam.y) / cam.scale;
    camera.current = { scale: next, x: cx - worldX * next, y: cy - worldY * next };
  }, []);

  /* ── Renderer lifecycle ───────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host || !graph) return;

    let renderer: StarMapRenderer;
    try {
      renderer = new StarMapRenderer(canvas, graph);
    } catch (cause) {
      setFailure(
        cause instanceof Error && /WebGL2/.test(cause.message)
          ? 'This browser cannot open the star map — it needs WebGL2.'
          : 'The star map could not start.',
      );
      return;
    }
    rendererRef.current = renderer;

    const applySize = () => {
      const rect = host.getBoundingClientRect();
      size.current = { width: rect.width, height: rect.height };
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderer.resize(rect.width, rect.height);
    };

    applySize();
    frameAll();

    const observer = new ResizeObserver(applySize);
    observer.observe(host);

    let running = true;
    const loop = () => {
      if (!running) return;
      // Fade the sky up as the layout settles rather than snapping in.
      reveal.current = Math.min(1, reveal.current + 0.035);
      renderer.render({
        camera: camera.current,
        selected: selectedRef.current,
        hovered: hoveredRef.current,
        reveal: reveal.current,
        reducedMotion,
      });
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frameRef.current);
      } else if (!running) {
        running = true;
        frameRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // A lost context is recoverable on some drivers, but the honest thing is
    // to say so rather than leave a black rectangle.
    const onLost = (event: Event) => {
      event.preventDefault();
      running = false;
      setFailure('The graphics context was lost. Reopen the map to try again.');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [graph, reducedMotion, frameAll]);

  /* ── Layout worker ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    setSettling(true);

    const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    const clusterByKey = new Map(graph.clusters.map((cluster) => [cluster.key, cluster]));

    worker.onmessage = (event: MessageEvent<LayoutMessage>) => {
      const { positions, ids } = event.data;
      const index = new Map(graph.nodes.map((node, at) => [node.id, at]));
      for (let i = 0; i < ids.length; i++) {
        const at = index.get(ids[i]!);
        if (at === undefined) continue;
        const node = graph.nodes[at]!;
        node.x = positions[i * 2]!;
        node.y = positions[i * 2 + 1]!;
      }
      if (event.data.type === 'done') {
        setSettling(false);
        frameAll();
      }
    };

    worker.postMessage({
      type: 'start',
      nodes: graph.nodes.map((node) => {
        const cluster = clusterByKey.get(node.cluster);
        return {
          id: node.id,
          cluster: node.cluster,
          world: node.world,
          degree: node.degree,
          x: node.x,
          y: node.y,
          homeX: cluster?.x ?? 0,
          homeY: cluster?.y ?? 0,
          population: cluster?.population ?? 1,
        };
      }),
      edges: graph.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sameCluster: edge.sameCluster,
        sameWorld: edge.sameWorld,
      })),
    });

    return () => {
      worker.postMessage({ type: 'stop' });
      worker.terminate();
      workerRef.current = null;
    };
  }, [graph, frameAll]);

  /* ── Pointer ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let travelled = 0;
    let pinchDistance = 0;

    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragging = true;
        travelled = 0;
      } else if (pointers.size === 2) {
        dragging = false;
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };

    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);

      if (pointers.size === 2 && previous) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchDistance > 0 && distance > 0) {
          zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, distance / pinchDistance);
        }
        pinchDistance = distance;
        return;
      }

      if (dragging && previous) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        travelled += Math.hypot(dx, dy);
        camera.current = {
          ...camera.current,
          x: camera.current.x + dx,
          // Screen y is down, the camera's is up.
          y: camera.current.y - dy,
        };
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        return;
      }

      if (pointers.size === 0) {
        const hit = hitTest(event.clientX, event.clientY);
        setHovered(hit);
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    };

    const onUp = (event: PointerEvent) => {
      const wasDragging = dragging && travelled > DRAG_SLOP;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
      if (pointers.size === 0) dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);

      if (wasDragging) return;

      const hit = hitTest(event.clientX, event.clientY);
      if (!hit) {
        setSelected(null);
        return;
      }
      // First press selects, a second on the same star opens it — which keeps
      // a fat-fingered tap on a phone from navigating away by accident.
      setSelected((current) => {
        if (current === hit) {
          onOpenEntry(hit);
          return current;
        }
        return hit;
      });
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Trackpads report small deltas continuously; a mouse reports ~100 in
      // one go. Normalising keeps both feeling the same.
      const step = Math.exp(-Math.sign(event.deltaY) * Math.min(0.35, Math.abs(event.deltaY) / 320));
      zoomAt(event.clientX, event.clientY, step);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [graph, hitTest, zoomAt, onOpenEntry]);

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      const nudge = event.shiftKey ? 220 : 70;
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          if (selectedRef.current) setSelected(null);
          else onClose();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          camera.current = { ...camera.current, x: camera.current.x + nudge };
          break;
        case 'ArrowRight':
          event.preventDefault();
          camera.current = { ...camera.current, x: camera.current.x - nudge };
          break;
        case 'ArrowUp':
          event.preventDefault();
          camera.current = { ...camera.current, y: camera.current.y - nudge };
          break;
        case 'ArrowDown':
          event.preventDefault();
          camera.current = { ...camera.current, y: camera.current.y + nudge };
          break;
        case '+':
        case '=':
          event.preventDefault();
          camera.current = {
            ...camera.current,
            scale: Math.min(MAX_SCALE, camera.current.scale * 1.25),
          };
          break;
        case '-':
        case '_':
          event.preventDefault();
          camera.current = {
            ...camera.current,
            scale: Math.max(MIN_SCALE, camera.current.scale * 0.8),
          };
          break;
        case '0':
          event.preventDefault();
          frameAll();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, frameAll]);

  /* ── Centre on a node when it is chosen from the list ─────────────────── */

  const focusNode = useCallback(
    (id: string) => {
      const node = graph?.nodes.find((item) => item.id === id);
      if (!node) return;
      const scale = Math.max(camera.current.scale, 0.9);
      camera.current = { scale, x: -node.x * scale, y: -node.y * scale };
      setSelected(id);
    },
    [graph],
  );

  /* ── Render ───────────────────────────────────────────────────────────── */

  const legend = useMemo(() => {
    if (!graph) return [];
    const seen = new Map<string, number>();
    for (const node of graph.nodes) seen.set(node.world, (seen.get(node.world) ?? 0) + 1);
    return [...seen.entries()].map(([world, count]) => ({
      world,
      count,
      colour: worldColor(world),
    }));
  }, [graph]);

  const selectedEntry = selected ? entryById.get(selected) : undefined;
  const selectedNode = selected ? graph?.nodes.find((node) => node.id === selected) : undefined;

  return (
    <div className="starmap" ref={hostRef} role="dialog" aria-modal="true" aria-label="Star map">
      <canvas ref={canvasRef} className="starmap__canvas" />

      {failure ? (
        <div className="starmap__failure">
          <p className="seal">{failure}</p>
          <button type="button" className="button button--gold" onClick={onClose}>
            Back to the archive
          </button>
        </div>
      ) : null}

      {loading || (settling && !failure) ? (
        <div className="starmap__status" role="status">
          <span className="starmap__pulse" aria-hidden="true" />
          <span className="seal">{loading ? 'Reading the archive…' : 'Charting the stars…'}</span>
        </div>
      ) : null}

      <div className="starmap__controls no-print">
        <button type="button" className="icon-button" onClick={() => zoomCentre(1.25)} aria-label="Zoom in">
          <Glyph name="plus" />
        </button>
        <button type="button" className="icon-button" onClick={() => zoomCentre(0.8)} aria-label="Zoom out">
          <span aria-hidden="true" className="starmap__minus" />
        </button>
        <button type="button" className="icon-button" onClick={frameAll} aria-label="Fit everything on screen">
          <Glyph name="star" />
        </button>
        <button type="button" className="icon-button starmap__close" onClick={onClose} aria-label="Close the star map">
          <Glyph name="close" />
        </button>
      </div>

      {legend.length > 0 ? (
        <ul className="starmap__legend" aria-label="Worlds">
          {legend.map((item) => (
            <li key={item.world}>
              <span className="starmap__legend-dot" style={{ background: item.colour }} aria-hidden="true" />
              <span>{item.world}</span>
              <span className="starmap__legend-count">{item.count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="starmap__hint" aria-hidden="true">
        Drag to pan · scroll to zoom · click a star, then click again to open · arrow keys to move ·
        0 to fit
      </p>

      {/**
       * The canvas is unreachable by keyboard and invisible to a screen
       * reader, so the same graph is also a list. It is positioned off-screen
       * but focusable, and choosing an entry centres the camera on it — the
       * two views stay in step rather than one being a consolation prize.
       */}
      <div className="starmap__index">
        <h2 className="sr-only">Every soul on the map</h2>
        <ul>
          {(graph?.nodes ?? []).map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => focusNode(node.id)}>
                {node.name} — {node.world}
                {node.era ? `, ${eraLabel(node.era)}` : ''}, {node.degree}{' '}
                {node.degree === 1 ? 'connection' : 'connections'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedEntry && selectedNode ? (
        <div className="starmap__panel">
          <Portrait
            entryId={selectedEntry.id}
            src={selectedEntry.portraitUrl}
            alt=""
            width={128}
            tint={selectedNode.colour}
            className="starmap__panel-portrait"
          />
          <div className="starmap__panel-body">
            <p className="starmap__panel-name" style={{ color: selectedNode.colour }}>
              {selectedEntry.name}
            </p>
            {selectedEntry.alias ? (
              <p className="starmap__panel-alias">{selectedEntry.alias}</p>
            ) : null}
            <p className="starmap__panel-meta">
              {selectedNode.world}
              {selectedNode.era ? ` · ${eraLabel(selectedNode.era)}` : ''}
              {selectedNode.degree
                ? ` · ${selectedNode.degree} ${selectedNode.degree === 1 ? 'connection' : 'connections'}`
                : ' · unconnected'}
            </p>
          </div>
          <button type="button" className="button button--gold" onClick={() => onOpenEntry(selectedEntry.id)}>
            Open
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSelected(null)}
            aria-label="Clear selection"
          >
            <Glyph name="close" />
          </button>
        </div>
      ) : null}
    </div>
  );

  function zoomCentre(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }
}
