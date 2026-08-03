import { eyebrow } from '../ui';
import { ticker } from '../core/ticker';
import { elementProgress } from '../core/scroll';
import { clamp01, smoothstep } from '../gl/math';

interface Path {
  name: string;
  d: string;
  note: string;
}

/** Four routes that begin apart and end on the same ground. */
const PATHS: Path[] = [
  {
    name: 'The seeker',
    note: 'senses that life contains forces most people rarely stop to observe',
    d: 'M8 44 C 130 40 210 62 300 78 C 396 96 460 116 540 138',
  },
  {
    name: 'The practitioner',
    note: 'has studied the Dragon, the formation, the water and the timing',
    d: 'M8 108 C 120 106 206 100 300 106 C 398 112 466 126 540 140',
  },
  {
    name: 'The leader',
    note: 'carries decisions that affect more than themselves',
    d: 'M8 176 C 128 176 208 160 302 148 C 400 136 470 140 540 143',
  },
  {
    name: 'The accomplished traveller',
    note: 'has reached a point where another familiar answer feels insufficient',
    d: 'M8 240 C 132 238 214 214 306 186 C 402 156 470 146 540 146',
  },
];

export function audienceMarkup(): string {
  const routes = PATHS.map(
    (path, index) => `
    <g class="route" data-route="${index}">
      <path class="route__line" d="${path.d}" fill="none" stroke="currentColor" stroke-width="1.4" />
      <circle class="route__head" r="2.4" fill="currentColor" />
    </g>`,
  ).join('');

  const legend = PATHS.map(
    (path) => `
    <li class="legend__item">
      <span class="legend__name">${path.name}</span>
      <span class="legend__note">${path.note}</span>
    </li>`,
  ).join('');

  return `
  <section class="section section--audience" id="audience" aria-labelledby="audience-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>
    <div class="shell audience__grid">
      <div class="audience__copy">
        ${eyebrow('Who this is for', '04')}
        <h2 class="display display--m" id="audience-title" data-reveal>
          You do not need to be a practitioner
        </h2>
        <div class="prose" data-reveal>
          <p>
            You may have studied Feng Shui, Qi Men Dun Jia, or BaZi for years. You may have never
            opened a Chinese metaphysics book. Both can stand on the same mountain and feel the
            scale of what is there.
          </p>
          <p>
            This experience is for the person who senses that life contains forces most people
            rarely stop long enough to observe. It is for the person who has reached a point where
            another holiday, another purchase, or another familiar answer feels insufficient.
          </p>
          <p>
            It is for the practitioner who has studied Dragon veins, mountain formations, water
            flow, and timing, and is ready to see the principles expressed across real terrain. It
            is for the leader, entrepreneur, or professional carrying decisions that affect more
            than themselves.
          </p>
          <p>
            It is for the person who has achieved much, yet feels that one area of life still
            refuses to move. It is for someone prepared to leave the familiar and stand somewhere
            ancient enough to alter their perspective.
          </p>
          <p class="land__pair">
            <span>There is nothing to prove before coming.</span>
            <span>Arrive ready to experience the land.</span>
          </p>
        </div>
      </div>

      <figure class="audience__map" data-reveal="fade">
        <svg class="routes" viewBox="0 0 600 300" id="routes" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="route-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="currentColor" stop-opacity="0.06" />
              <stop offset="0.5" stop-color="currentColor" stop-opacity="0.55" />
              <stop offset="1" stop-color="currentColor" stop-opacity="1" />
            </linearGradient>
          </defs>
          <g class="routes__terrain" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.3">
            <path d="M392 300 C 432 234 460 190 494 160 C 520 137 546 142 578 120 C 592 111 598 104 600 98" />
            <path d="M446 300 C 486 240 512 204 542 178 C 562 160 580 158 600 148" />
            <path d="M508 300 C 542 252 562 226 586 206 C 594 199 598 196 600 194" />
          </g>
          <g class="routes__lines" stroke="url(#route-fade)">${routes}</g>
          <circle class="routes__gather" cx="540" cy="143" r="9" fill="none" stroke="currentColor" stroke-width="0.9" />
          <circle class="routes__gather routes__gather--inner" cx="540" cy="143" r="2.4" fill="currentColor" />
        </svg>
        <figcaption class="visually-hidden">
          Four separate routes across a valley that gradually converge as they reach the mountains.
        </figcaption>
      </figure>

      <ol class="legend" data-reveal>${legend}</ol>
    </div>
  </section>`;
}

export function initAudience(reducedMotion: boolean): void {
  const section = document.getElementById('audience');
  const svg = document.getElementById('routes');
  if (!section || !svg) return;

  const routes = Array.from(svg.querySelectorAll<SVGGElement>('.route'));
  const lines = routes.map((route) => route.querySelector<SVGPathElement>('.route__line'));
  const heads = routes.map((route) => route.querySelector<SVGCircleElement>('.route__head'));
  const lengths = lines.map((line) => line?.getTotalLength() ?? 0);

  lines.forEach((line, i) => {
    if (!line) return;
    line.style.strokeDasharray = String(lengths[i]);
    line.style.strokeDashoffset = reducedMotion ? '0' : String(lengths[i]);
  });

  if (reducedMotion) {
    heads.forEach((head, i) => {
      const line = lines[i];
      if (!head || !line) return;
      const point = line.getPointAtLength(lengths[i] ?? 0);
      head.setAttribute('cx', String(point.x));
      head.setAttribute('cy', String(point.y));
    });
    return;
  }

  ticker.add(() => {
    const p = clamp01((elementProgress(section) - 0.12) / 0.6);
    lines.forEach((line, i) => {
      const length = lengths[i] ?? 0;
      const local = clamp01(smoothstep(i * 0.06, 0.72 + i * 0.06, p));
      if (line) line.style.strokeDashoffset = String(length * (1 - local));
      const head = heads[i];
      if (head && line && local > 0) {
        const point = line.getPointAtLength(length * local);
        head.setAttribute('cx', String(point.x));
        head.setAttribute('cy', String(point.y));
        head.style.opacity = String(local > 0.02 ? 1 : 0);
      }
    });
  });
}
