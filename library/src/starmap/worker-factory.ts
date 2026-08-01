/**
 * How the layout worker gets built.
 *
 * A one-line indirection so the standalone single-file build can swap in a
 * different construction without `StarMap.tsx` knowing about it. Vite emits
 * the `new URL(...)` form as its own chunk, which is what we want on the web:
 * the worker and the 30KB of d3-force inside it are fetched only when someone
 * actually opens the star map, and cached separately afterwards.
 *
 * See `worker-factory.standalone.ts` for the inlined counterpart.
 */
export function createLayoutWorker(): Worker {
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
}
