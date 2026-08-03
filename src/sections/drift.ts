import { ticker } from '../core/ticker';
import { trackVisibility } from '../core/reveal';
import { clamp01, lerp } from '../gl/math';
import { pixelRatio } from '../core/capabilities';

/**
 * The instrument drift.
 *
 * A single canvas that begins as clean topographic contour lines and, as the
 * section is read, degrades into the shapes of a system under stress: stepped
 * readings, routes crossing between points, a network, a dial running fast,
 * and a grid of dates losing its order. Everything is generated, so it carries
 * no real figures, headlines or sources.
 */
export function initDrift(canvasId: string, getIntensity: () => number, reducedMotion: boolean): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let visible = false;
  let time = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(pixelRatio(), 1.75);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener('resize', resize, { passive: true });
  trackVisibility(canvas, (v) => {
    visible = v;
  }, '15%');

  const noise = (x: number, seed: number) => {
    return (
      Math.sin(x * 0.9 + seed) * 0.5 +
      Math.sin(x * 2.3 + seed * 1.7) * 0.28 +
      Math.sin(x * 5.1 + seed * 0.6) * 0.14
    );
  };

  const draw = () => {
    const corrupt = clamp01(getIntensity());
    ctx.clearRect(0, 0, width, height);
    if (corrupt <= 0.001) return;

    const ink = (alpha: number) =>
      `rgba(${Math.round(lerp(150, 214, corrupt))}, ${Math.round(
        lerp(160, 54, corrupt),
      )}, ${Math.round(lerp(168, 44, corrupt))}, ${alpha})`;

    // --- readings ----------------------------------------------------------
    const rows = 7;
    ctx.lineWidth = 0.7;
    for (let row = 0; row < rows; row++) {
      const base = height * (0.16 + (row / rows) * 0.72);
      const seed = row * 2.7;
      const amp = lerp(10, 34, corrupt) * (0.5 + (row % 3) * 0.28);
      ctx.beginPath();
      const steps = Math.max(48, Math.round(width / 12));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * width;
        const smooth = noise(t * 6 + row, seed) * amp;
        const stepped =
          Math.round(noise(t * 9 + row * 1.3, seed + 4) * 5) * (amp * 0.34) +
          (Math.sin(t * 90 + time * (1 + row)) > 0.86 ? amp * 0.9 * corrupt : 0);
        const y = base + lerp(smooth, stepped, corrupt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ink(lerp(0.1, 0.34, corrupt) * (0.5 + (row % 2) * 0.5));
      ctx.stroke();
    }

    // --- routes ------------------------------------------------------------
    if (corrupt > 0.18) {
      const routes = Math.round(lerp(0, 9, corrupt));
      ctx.lineWidth = 0.6;
      for (let i = 0; i < routes; i++) {
        const s = i * 1.9;
        const x1 = (Math.sin(s) * 0.5 + 0.5) * width;
        const y1 = (Math.sin(s * 1.7 + 1.1) * 0.5 + 0.5) * height;
        const x2 = (Math.sin(s * 2.3 + 2.4) * 0.5 + 0.5) * width;
        const y2 = (Math.sin(s * 0.8 + 3.9) * 0.5 + 0.5) * height;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - Math.abs(x2 - x1) * 0.28;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.strokeStyle = ink(0.14 * corrupt);
        ctx.stroke();

        const travel = (time * 0.12 + i * 0.13) % 1;
        const px = lerp(lerp(x1, mx, travel), lerp(mx, x2, travel), travel);
        const py = lerp(lerp(y1, my, travel), lerp(my, y2, travel), travel);
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = ink(0.5 * corrupt);
        ctx.fill();
      }
    }

    // --- dial running fast --------------------------------------------------
    if (corrupt > 0.3) {
      const cx = width * 0.82;
      const cy = height * 0.24;
      const r = Math.min(width, height) * 0.09;
      ctx.strokeStyle = ink(0.24 * corrupt);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      const hand = time * (0.4 + corrupt * 5.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hand) * r * 0.78, cy + Math.sin(hand) * r * 0.78);
      ctx.strokeStyle = ink(0.6 * corrupt);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- a grid of days losing its order -----------------------------------
    if (corrupt > 0.42) {
      const cols = 7;
      const rowsC = 5;
      const cell = Math.min(width, height) * 0.028;
      const ox = width * 0.07;
      const oy = height * 0.66;
      ctx.lineWidth = 0.6;
      for (let r = 0; r < rowsC; r++) {
        for (let c = 0; c < cols; c++) {
          const index = r * cols + c;
          const jitter = Math.max(0, corrupt - 0.5) * 2;
          const jx = Math.sin(index * 3.1 + time * 0.4) * cell * 0.5 * jitter;
          const jy = Math.cos(index * 2.3 + time * 0.3) * cell * 0.4 * jitter;
          const x = ox + c * cell * 1.35 + jx;
          const y = oy + r * cell * 1.35 + jy;
          ctx.strokeStyle = ink(0.16 * corrupt);
          ctx.strokeRect(x, y, cell, cell);
          if (Math.sin(index * 7.7) > 0.55 && corrupt > 0.6) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + cell, y + cell);
            ctx.strokeStyle = ink(0.4 * corrupt);
            ctx.stroke();
          }
        }
      }
    }

    // --- a network that keeps adding connections ---------------------------
    if (corrupt > 0.5) {
      const nodes = 14;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < nodes; i++) {
        const a = i * 2.399;
        pts.push([
          width * (0.5 + Math.cos(a) * 0.36 * (0.4 + (i % 5) / 6)),
          height * (0.5 + Math.sin(a) * 0.32 * (0.4 + (i % 4) / 5)),
        ]);
      }
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = ink(0.1 * corrupt);
      for (let i = 0; i < nodes; i++) {
        for (let j = i + 1; j < nodes; j++) {
          const link = Math.sin(i * 3.3 + j * 1.7);
          if (link < 0.72 - corrupt * 0.35) continue;
          const a = pts[i]!;
          const b = pts[j]!;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
      ctx.fillStyle = ink(0.4 * corrupt);
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  if (reducedMotion) {
    // One static frame, still art directed, with nothing in motion.
    time = 4;
    const render = () => draw();
    window.addEventListener('resize', () => {
      resize();
      render();
    });
    ticker.add(() => {
      if (!visible) return;
      render();
    });
    return;
  }

  let accumulator = 0;
  ticker.add((dt) => {
    if (!visible) return;
    time += dt;
    accumulator += dt;
    // Thirty frames a second is plenty for line work of this weight.
    if (accumulator < 1 / 30) return;
    accumulator = 0;
    draw();
  });
}
