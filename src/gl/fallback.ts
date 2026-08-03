import { ticker } from '../core/ticker';
import { viewport } from '../core/scroll';
import { clamp01 } from './math';
import { pointer } from '../core/pointer';
import { plate } from '../ui';

/**
 * The landscape without WebGL.
 *
 * A wide plate rendered from the same shader carries the range, with layered
 * ridge silhouettes in front of it for depth and a point of light at the site.
 * The narrative colour arc still runs: ceremonial gold at the opening, crimson
 * through the warning, gold again at the resolution. A visitor who has asked
 * for reduced motion, or whose device cannot run the shader, gets the same
 * journey with nothing in motion that they did not ask for.
 */
function ridgePath(seed: number, height: number, roughness: number): string {
  const points: string[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * 1200;
    const n =
      Math.sin(t * 5.3 + seed) * 0.5 +
      Math.sin(t * 12.1 + seed * 2.3) * 0.3 +
      Math.sin(t * 25.7 + seed * 0.7) * 0.16;
    const y = height + n * roughness;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M-40,440 L${points.join(' L')} L1240,440 Z`;
}

export function fallbackMarkup(): string {
  const layers = [
    { seed: 1.2, height: 214, rough: 40, className: 'far' },
    { seed: 4.7, height: 268, rough: 52, className: 'mid' },
    { seed: 9.1, height: 330, rough: 38, className: 'near' },
  ]
    .map(
      (layer) =>
        `<path class="fallback__ridge fallback__ridge--${layer.className}" d="${ridgePath(
          layer.seed,
          layer.height,
          layer.rough,
        )}" />`,
    )
    .join('');

  return `
  <div class="fallback" id="fallback" aria-hidden="true">
    <div class="fallback__plate">
      ${plate('fallback-range', '', { sizes: '100vw', eager: true })}
    </div>
    <div class="fallback__grade"></div>
    <svg class="fallback__scene" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMax slice">
      <defs>
        <radialGradient id="fallback-spot">
          <stop offset="0" stop-color="var(--fallback-spot)" stop-opacity="0.9" />
          <stop offset="0.45" stop-color="var(--fallback-spot)" stop-opacity="0.28" />
          <stop offset="1" stop-color="var(--fallback-spot)" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="fallback-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0d1118" stop-opacity="0" />
          <stop offset="1" stop-color="#0d1118" stop-opacity="0.85" />
        </linearGradient>
      </defs>
      <circle class="fallback__glow" cx="640" cy="236" r="150" fill="url(#fallback-spot)" />
      ${layers}
      <rect class="fallback__band" x="-40" y="250" width="1280" height="96" fill="url(#fallback-mist)" />
      <circle class="fallback__point" cx="640" cy="244" r="2.6" />
    </svg>
    <div class="fallback__mist"></div>
  </div>`;
}

export function initFallback(reducedMotion: boolean): void {
  const root = document.getElementById('fallback');
  if (!root) return;
  const layers = Array.from(root.querySelectorAll<SVGPathElement>('.fallback__ridge'));
  const plateLayer = root.querySelector<HTMLElement>('.fallback__plate');

  ticker.add(() => {
    const p = clamp01(viewport.scrollY / (viewport.maxScroll || 1));
    root.style.setProperty('--journey', p.toFixed(4));
    if (reducedMotion) return;
    const depths = [12, 26, 46];
    layers.forEach((layer, i) => {
      const depth = depths[i] ?? 20;
      const y = -p * depth * 2.4;
      const x = pointer.ex * depth * 0.22;
      layer.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    });
    if (plateLayer) {
      plateLayer.style.transform = `translate3d(${(pointer.ex * -6).toFixed(1)}px, ${(
        -p * 34
      ).toFixed(1)}px, 0) scale(1.08)`;
    }
  });
}
