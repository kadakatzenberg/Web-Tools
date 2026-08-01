import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/app/hooks';

interface ConstellationProps {
  /** Era pigments to draw with, so the field matches what the archive holds. */
  palette: string[];
  /** Roughly how many stars at 1440px wide; scales with area. */
  density?: number;
}

/**
 * The drift behind the front matter: a slow field of stars that draw lines to
 * whichever neighbours are close enough, in the pigments of the eras the
 * archive actually contains.
 *
 * Deliberately a 2D canvas rather than WebGL — it is a background at low
 * opacity, and a second GL context on the landing page would cost more than
 * it returns. The star map, where the pixels matter, is a different story.
 *
 * Three things keep it honest:
 *   - It stops entirely when scrolled out of view (IntersectionObserver), so
 *     it is not burning a core while someone reads further down.
 *   - It stops when the tab is hidden.
 *   - Under `prefers-reduced-motion` it draws one static frame and never
 *     schedules another.
 */
interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  colour: string;
  phase: number;
}

export function Constellation({ palette, density = 90 }: ConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const colours = palette.length ? palette : ['#c8a030'];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = false;
    let visible = true;

    let stars: Star[] = [];

    const seed = (() => {
      let s = 0x9e3779b9;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const count = Math.round(density * Math.min(2.2, (width * height) / (1440 * 620)));
      stars = Array.from({ length: count }, () => ({
        x: seed() * width,
        y: seed() * height,
        vx: (seed() - 0.5) * 0.11,
        vy: (seed() - 0.5) * 0.11,
        r: 0.5 + seed() * 1.5,
        colour: colours[Math.floor(seed() * colours.length)] ?? '#c8a030',
        phase: seed() * Math.PI * 2,
      }));
    };

    /**
     * One glow sprite per colour, drawn once.
     *
     * The obvious version calls `createRadialGradient` inside the star loop.
     * That allocates a gradient object, and the rasteriser rebuilds its colour
     * ramp, once per star per frame — ninety allocations every 16ms, which is
     * the single most expensive thing on the landing page and the classic way
     * to make a canvas background cost more than the page it sits behind.
     * Baked into a small offscreen canvas per colour, it becomes a blit.
     */
    const sprites = new Map<string, HTMLCanvasElement>();
    const SPRITE = 64;
    const spriteFor = (colour: string): HTMLCanvasElement => {
      const existing = sprites.get(colour);
      if (existing) return existing;
      const sprite = document.createElement('canvas');
      sprite.width = SPRITE;
      sprite.height = SPRITE;
      const sctx = sprite.getContext('2d')!;
      const glow = sctx.createRadialGradient(
        SPRITE / 2,
        SPRITE / 2,
        0,
        SPRITE / 2,
        SPRITE / 2,
        SPRITE / 2,
      );
      glow.addColorStop(0, colour);
      glow.addColorStop(0.35, colour);
      glow.addColorStop(1, 'transparent');
      sctx.globalAlpha = 0.5;
      sctx.fillStyle = glow;
      sctx.fillRect(0, 0, SPRITE, SPRITE);
      sprites.set(colour, sprite);
      return sprite;
    };

    /**
     * Neighbours by grid bucket, not by comparing everybody to everybody.
     *
     * The pairwise version is 90 stars → 4,005 distance tests per frame, and
     * it grows with the square of the count, so widening the field made it
     * quadratically worse. Since a link only exists inside `LINK_RANGE`, only
     * stars in the same bucket or the one next door can possibly be close
     * enough — which turns it into a handful of tests each.
     */
    const LINK_RANGE = 145; // px; 21_000 ≈ 145²
    const LINK_RANGE_SQ = LINK_RANGE * LINK_RANGE;
    let buckets = new Map<number, Star[]>();
    let columns = 1;

    const rebuildBuckets = () => {
      buckets = new Map();
      columns = Math.max(1, Math.ceil(width / LINK_RANGE));
      const rows = Math.max(1, Math.ceil(height / LINK_RANGE));
      for (const star of stars) {
        const cx = Math.min(columns - 1, Math.max(0, Math.floor(star.x / LINK_RANGE)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(star.y / LINK_RANGE)));
        const key = cy * columns + cx;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(star);
        else buckets.set(key, [star]);
      }
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      rebuildBuckets();

      // Lines first, so stars sit on top of their own threads.
      ctx.lineWidth = 0.6;
      for (const [key, bucket] of buckets) {
        const cx = key % columns;
        const cy = Math.floor(key / columns);
        for (const a of bucket) {
          // Half the neighbourhood: the other half sees this pair from its
          // own side, and testing both would draw every line twice.
          for (let ox = 0; ox <= 1; ox++) {
            for (let oy = ox === 0 ? 0 : -1; oy <= 1; oy++) {
              const other = buckets.get((cy + oy) * columns + (cx + ox));
              if (!other) continue;
              for (const b of other) {
                if (a === b) continue;
                if (ox === 0 && oy === 0 && b.x < a.x) continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > LINK_RANGE_SQ) continue;
                ctx.strokeStyle = a.colour;
                ctx.globalAlpha = (1 - d2 / LINK_RANGE_SQ) * 0.3;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
              }
            }
          }
        }
      }

      for (const star of stars) {
        const twinkle = reduced ? 1 : 0.62 + Math.sin(frame * 0.021 + star.phase) * 0.38;
        const halo = star.r * 7;

        ctx.globalAlpha = twinkle;
        ctx.drawImage(spriteFor(star.colour), star.x - halo, star.y - halo, halo * 2, halo * 2);

        ctx.globalAlpha = 0.85 * twinkle;
        ctx.fillStyle = star.colour;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      if (!running) return;
      frame++;
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < -20) star.x = width + 20;
        if (star.x > width + 20) star.x = -20;
        if (star.y < -20) star.y = height + 20;
        if (star.y > height + 20) star.y = -20;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    let raf = 0;
    const start = () => {
      if (running || reduced || !visible) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    build();
    draw();
    if (!reduced) start();

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible) start();
        else stop();
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const resize = new ResizeObserver(() => {
      build();
      draw();
    });
    resize.observe(canvas);

    return () => {
      stop();
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [palette, density, reduced]);

  return <canvas ref={canvasRef} className="constellation" aria-hidden="true" />;
}
