/**
 * Ambient war-table atmosphere: drifting embers over a slow ink wash, tinted by
 * the active phase.
 *
 * Deliberately Canvas 2D rather than WebGL — the effect is low-frequency and
 * cheap, so the extra context costs more than it buys, and there is no WebGL
 * fallback to maintain. The layer is purely decorative and sits behind an
 * `aria-hidden` boundary.
 *
 * Cost controls: device pixel ratio capped at 1.5, particle count scaled by
 * quality tier, the loop stops entirely when the tab is hidden or reduced
 * motion is requested, and resize work is debounced through rAF.
 */

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion, useIsVisible, useQualityTier } from "@/ui/hooks";

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
}

const PHASE_TINT: Record<number, [number, number, number]> = {
  0: [78, 207, 154],
  1: [227, 81, 65],
  2: [232, 169, 60],
};

export function Atmosphere({ phase }: { phase: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const visible = useIsVisible();
  const tier = useQualityTier();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    // No animation when the user asked for stillness, or while hidden.
    if (reduced || !visible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const count = tier === "low" ? 18 : 44;
    let w = 0;
    let h = 0;
    let raf = 0;
    let resizeRaf = 0;

    const embers: Ember[] = [];

    const spawn = (seed = false): Ember => {
      const maxLife = 5200 + Math.random() * 6400;
      return {
        x: Math.random() * w,
        y: seed ? Math.random() * h : h + 12,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -(0.045 + Math.random() * 0.075),
        r: 0.5 + Math.random() * 1.5,
        life: seed ? Math.random() * maxLife : 0,
        maxLife,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    };

    resize();
    for (let i = 0; i < count; i++) embers.push(spawn(true));

    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;

      ctx.clearRect(0, 0, w, h);

      const tint = PHASE_TINT[phaseRef.current] ?? PHASE_TINT[0]!;
      const [tr, tg, tb] = tint;

      for (let i = 0; i < embers.length; i++) {
        const e = embers[i]!;
        e.life += dt;
        if (e.life >= e.maxLife || e.y < -12) {
          embers[i] = spawn();
          continue;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;

        // Fade in and out so embers never pop.
        const t = e.life / e.maxLife;
        const alpha = Math.sin(Math.PI * t) * 0.42;
        if (alpha <= 0.004) continue;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${tr},${tg},${tb},${alpha})`;
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced, visible, tier]);

  return (
    <canvas
      ref={canvasRef}
      className="atmosphere"
      aria-hidden="true"
      data-testid="atmosphere"
    />
  );
}
