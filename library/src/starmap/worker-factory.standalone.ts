/**
 * The standalone build's layout worker.
 *
 * `?worker&inline` base64s the compiled worker into this module and
 * constructs it from a blob URL, so there is no second file to fetch — which
 * there could not be, since the document is being read off a disk.
 *
 * The blob is a classic script, not a module (`worker.format: 'iife'` in
 * vite.standalone.config.ts): Firefox still refuses to construct a module
 * worker from a blob URL, and an inlined worker is always a blob.
 */
import LayoutWorker from './layout.worker.ts?worker&inline';

export function createLayoutWorker(): Worker {
  return new LayoutWorker();
}
