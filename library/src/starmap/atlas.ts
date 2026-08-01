/**
 * Portraits on the star map.
 *
 * v1 drew a face inside every node: it kept 304 `Image` objects alive and, for
 * each one, called `ctx.save(); ctx.clip(); ctx.drawImage(); ctx.restore()`
 * every frame. That is 304 clip-and-restore pairs at 60fps, and it is the
 * single most expensive thing the old map did — but it is also the thing that
 * made it read as an archive of *people* rather than a scatter plot, so it has
 * to come back.
 *
 * Here every portrait is packed into one texture and the star shader samples
 * its own tile. The whole field stays a single instanced draw call: the faces
 * cost one texture bind, not one draw call each.
 *
 * Loading is progressive and out-of-order. Each image is drawn into the atlas
 * canvas as it arrives and uploaded with `texSubImage2D` for just that tile,
 * so nothing waits on the slowest portrait and the map is usable immediately —
 * nodes simply light up with a face as their image lands.
 */

/** Tile edge in pixels. Nodes cap at 46px on screen, so this stays sharp. */
const TILE = 128;

export interface AtlasSlot {
  /** Index into the grid, or -1 when this node has no portrait. */
  tile: number;
}

export class PortraitAtlas {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  readonly texture: WebGLTexture;
  readonly size: number;
  readonly columns: number;

  /** Node id → tile index. Absent means no portrait, or no room. */
  private slots = new Map<string, number>();
  private loading = new Set<string>();
  private disposed = false;

  /** Raised every time a tile lands, so the renderer knows to redraw. */
  onTileReady: (() => void) | null = null;

  constructor(gl: WebGL2RenderingContext, capacity: number) {
    this.gl = gl;

    // Squeeze into whatever the GPU will actually allocate. WebGL2 guarantees
    // 2048; anything modern reports 8192 or more. A 4096 atlas holds 1024
    // portraits at 128px, which is three times the current archive.
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const needed = Math.ceil(Math.sqrt(Math.max(1, capacity))) * TILE;
    this.size = Math.min(maxTexture, nextPowerOfTwo(needed));
    this.columns = Math.max(1, Math.floor(this.size / TILE));

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Could not open a 2D context for the portrait atlas');
    this.ctx = ctx;

    const texture = gl.createTexture();
    if (!texture) throw new Error('Could not create the portrait atlas texture');
    this.texture = texture;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.size,
      this.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    // CLAMP_TO_EDGE and linear filtering only — no mipmaps. A mipmapped atlas
    // bleeds neighbouring tiles into each other at distance, which shows up as
    // a smear of the wrong face around the rim of a zoomed-out node.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  get capacity(): number {
    return this.columns * this.columns;
  }

  tileFor(id: string): number {
    return this.slots.get(id) ?? -1;
  }

  /**
   * Queue a portrait.
   *
   * Ordering matters when the archive outgrows the atlas: callers pass nodes
   * most-connected first, so the hubs — the ones drawn largest and labelled
   * first — are the ones that get a face.
   */
  request(id: string, url: string, index: number): void {
    if (this.disposed || !url) return;
    if (this.slots.has(id) || this.loading.has(id)) return;
    if (index >= this.capacity) return;

    this.loading.add(id);

    const image = new Image();
    // Supabase serves public objects with permissive CORS. Without this the
    // texture upload taints and throws, which is how v1's portraits behaved
    // the one time someone pointed the bucket at a CDN that did not send it.
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    image.onload = () => {
      if (this.disposed) return;
      this.loading.delete(id);
      try {
        this.paint(image, index);
        this.slots.set(id, index);
        this.upload(index);
        this.onTileReady?.();
      } catch {
        // A tainted canvas, or a decode that failed after load fired. The
        // node keeps its procedural star, which is a fine thing to be.
      }
    };
    image.onerror = () => {
      this.loading.delete(id);
    };
    image.src = url;
  }

  /** Cover-crop into the tile, anchored at the top — portraits are faces. */
  private paint(image: HTMLImageElement, index: number): void {
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    const x = column * TILE;
    const y = row * TILE;

    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (!iw || !ih) throw new Error('Portrait has no dimensions');

    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    // Top-anchored rather than centred: a 3:4 character portrait centred on
    // its own bounding box crops the head off.
    const sy = 0;

    this.ctx.clearRect(x, y, TILE, TILE);
    this.ctx.drawImage(image, sx, sy, side, side, x, y, TILE, TILE);
  }

  private upload(index: number): void {
    const gl = this.gl;
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);

    // One tile, not the whole sheet: a 4096² re-upload per portrait would be
    // 67MB of traffic to the GPU for every face that lands.
    const tile = this.ctx.getImageData(column * TILE, row * TILE, TILE, TILE);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      column * TILE,
      row * TILE,
      TILE,
      TILE,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      tile.data,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  dispose(): void {
    this.disposed = true;
    this.onTileReady = null;
    this.slots.clear();
    this.loading.clear();
    this.gl.deleteTexture(this.texture);
  }
}

function nextPowerOfTwo(value: number): number {
  let size = 256;
  while (size < value) size *= 2;
  return size;
}
