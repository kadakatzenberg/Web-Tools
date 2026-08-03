import { cta, eyebrow } from '../ui';
import { ticker } from '../core/ticker';
import { stickyProgress } from '../core/scroll';
import { clamp01, lerp, smoothstep } from '../gl/math';
import { soundscape } from '../core/audio';
import type { Narrative } from '../core/narrative';

const BRANCHES = [
  'Zi',
  'Chou',
  'Yin',
  'Mao',
  'Chen',
  'Si',
  'Wu',
  'Wei',
  'Shen',
  'You',
  'Xu',
  'Hai',
];

const STEMS = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'];

const BEARINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Luo Shu arrangement, used for the nine palaces at the centre of the dial. */
const PALACES = [4, 9, 2, 3, 5, 7, 8, 1, 6];

function ringLabels(
  values: readonly (string | number)[],
  radius: number,
  size: number,
  className: string,
  offset = 0,
): string {
  return values
    .map((value, index) => {
      const angle = ((index + offset) / values.length) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const x = 250 + Math.cos(rad) * radius;
      const y = 250 + Math.sin(rad) * radius;
      // Labels sit radially, but flip through the lower half so nothing on the
      // dial is ever read upside down.
      let rotation = angle + 90;
      if (rotation > 90 && rotation < 270) rotation -= 180;
      return `<text class="${className}" x="${x.toFixed(2)}" y="${y.toFixed(
        2,
      )}" font-size="${size}" text-anchor="middle" dominant-baseline="central" transform="rotate(${rotation.toFixed(
        2,
      )} ${x.toFixed(2)} ${y.toFixed(2)})">${value}</text>`;
    })
    .join('');
}

function ringTicks(count: number, radius: number, length: number, every = 1): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((i / count) * 360 - 90) * (Math.PI / 180);
    const long = i % every === 0;
    const r1 = radius - (long ? length : length * 0.45);
    out.push(
      `<line x1="${(250 + Math.cos(angle) * r1).toFixed(2)}" y1="${(
        250 +
        Math.sin(angle) * r1
      ).toFixed(2)}" x2="${(250 + Math.cos(angle) * radius).toFixed(2)}" y2="${(
        250 +
        Math.sin(angle) * radius
      ).toFixed(2)}" opacity="${long ? 0.85 : 0.35}" />`,
    );
  }
  return out.join('');
}

export function timingMarkup(): string {
  const palaces = PALACES.map((n, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return `<text class="orrery__palace" x="${232 + col * 18}" y="${
      232 + row * 18
    }" font-size="11" text-anchor="middle" dominant-baseline="central">${n}</text>`;
  }).join('');

  return `
  <section class="section section--timing" id="timing" aria-labelledby="timing-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>

    <div class="shell timing__intro">
      ${eyebrow('Sacred timing', '03')}
      <h2 class="display display--m" id="timing-title" data-reveal>Where miracles happen</h2>
      <div class="prose timing__prose" data-reveal>
        <p>
          A powerful location is one part of the equation. Time carries its own quality.
        </p>
        <p>
          For the excursion, Joey draws from multiple systems to understand the land, the moment,
          and the person entering it.
        </p>
      </div>

      <ul class="systems" data-reveal>
        <li class="system">
          <span class="system__name">Landform Feng Shui</span>
          <span class="system__role">reveals the terrain</span>
        </li>
        <li class="system">
          <span class="system__name">Qi Men Dun Jia</span>
          <span class="system__role">reveals strategic timing and direction</span>
        </li>
        <li class="system">
          <span class="system__name">Date Selection</span>
          <span class="system__role">identifies the window</span>
        </li>
        <li class="system">
          <span class="system__name">BaZi</span>
          <span class="system__role">brings the individual into the reading</span>
        </li>
      </ul>
    </div>

    <div class="timing__track" id="timing-track">
      <div class="timing__stick">
        <div class="orrery" id="orrery">
          <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false">
            <g class="orrery__ring" data-ring="0">
              <circle cx="250" cy="250" r="238" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.3" />
              <g stroke="currentColor" stroke-width="0.5">${ringTicks(72, 238, 12, 9)}</g>
              ${ringLabels(BEARINGS, 218, 9, 'orrery__bearing')}
            </g>
            <g class="orrery__ring" data-ring="1">
              <circle cx="250" cy="250" r="196" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.4" />
              ${ringLabels(BRANCHES, 178, 10, 'orrery__label')}
            </g>
            <g class="orrery__ring" data-ring="2">
              <circle cx="250" cy="250" r="154" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.35" />
              ${ringLabels(STEMS, 138, 9, 'orrery__label orrery__label--dim')}
            </g>
            <g class="orrery__ring" data-ring="3">
              <circle cx="250" cy="250" r="112" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.45" />
              <g stroke="currentColor" stroke-width="0.6">${ringTicks(36, 112, 9, 3)}</g>
              <path class="orrery__window" d="M250 250 L 250 138 A 112 112 0 0 1 306 153 Z" opacity="0.16" />
            </g>
            <g class="orrery__ring" data-ring="4">
              <circle cx="250" cy="250" r="74" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.5" />
              <g class="orrery__pillars" stroke="currentColor" stroke-width="0.7">
                <line x1="222" y1="200" x2="222" y2="300" opacity="0.6" />
                <line x1="240" y1="192" x2="240" y2="308" opacity="0.8" />
                <line x1="260" y1="192" x2="260" y2="308" opacity="0.8" />
                <line x1="278" y1="200" x2="278" y2="300" opacity="0.6" />
              </g>
            </g>
            <g class="orrery__core">
              <g class="orrery__grid" stroke="currentColor" stroke-width="0.35" opacity="0.4">
                <path d="M223 223 h54 M223 241 h54 M223 259 h54 M223 277 h54" />
                <path d="M223 223 v54 M241 223 v54 M259 223 v54 M277 223 v54" />
              </g>
              ${palaces}
            </g>
            <circle class="orrery__centre" cx="250" cy="250" r="3" fill="currentColor" />
            <line class="orrery__index" x1="250" y1="12" x2="250" y2="44" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </div>

        <p class="timing__climax" id="timing-climax" aria-hidden="true">
          <span>Where</span><span>miracles</span><span>happen</span>
        </p>
      </div>
    </div>

    <div class="shell timing__outro">
      <div class="prose timing__prose" data-reveal>
        <p>At selected moments, Heaven, Earth, and Human converge.</p>
        <p class="verse">
          <span>Heaven provides the time.</span>
          <span>Earth provides the place.</span>
          <span>Human provides the intention.</span>
        </p>
        <p>
          At these moments, participants may meditate, perform an activation, make a wish, or
          bring their attention to something within their lives that must change.
        </p>
      </div>

      <ul class="responses" data-reveal>
        <li>Some people describe warmth moving through the body.</li>
        <li>Some feel tingling, lightness, or unusual stillness.</li>
        <li>Some encounter an emotional release they did not expect.</li>
        <li>
          Others finally understand what Qi means because they experience the environment
          directly.
        </li>
      </ul>

      <p class="note" data-reveal>
        Experiences differ. No specific personal outcome should be presented as assured.
      </p>

      <div data-reveal>${cta({ label: 'I Feel Called To This', magnetic: true })}</div>
    </div>
  </section>`;
}

export function initTiming(narrative: Narrative, reducedMotion: boolean): void {
  const track = document.getElementById('timing-track');
  const orrery = document.getElementById('orrery');
  const climax = document.getElementById('timing-climax');
  const veil = document.querySelector<HTMLElement>('.veil--light');
  if (!track || !orrery) return;

  const rings = Array.from(orrery.querySelectorAll<SVGGElement>('.orrery__ring'));
  const speeds = [2.1, -3.4, 4.6, -6.2, 8.4];
  const aligned = [0, 0, 0, 0, 0];
  const drift = [0, 0, 0, 0, 0];
  let struck = false;

  narrative.addModifier((state) => {
    const p = stickyProgress(track);
    if (p <= 0 || p >= 1) return;
    const converge = smoothstep(0.55, 0.9, p);
    state.meridian = Math.max(state.meridian, converge);
    state.bloom = lerp(state.bloom, 1.15, converge);
    state.particles = Math.max(state.particles, 0.8 + converge * 0.6);
    state.timeScale = lerp(1, 0.12, smoothstep(0.86, 0.99, p));
  });

  ticker.add((dt) => {
    const p = stickyProgress(track);
    const visible = p > 0 && p < 1;
    orrery.classList.toggle('is-live', visible);
    if (!visible && !reducedMotion) return;

    const converge = smoothstep(0.5, 0.92, p);
    const spin = reducedMotion ? 0 : 1 - converge;

    rings.forEach((ring, i) => {
      drift[i] = (drift[i] ?? 0) + (speeds[i] ?? 0) * dt * spin;
      const target = Math.round((drift[i] ?? 0) / 360) * 360 + (aligned[i] ?? 0);
      const angle = lerp(drift[i] ?? 0, target, converge);
      ring.style.transform = `rotate(${angle.toFixed(3)}deg)`;
    });

    const light = clamp01(smoothstep(0.78, 0.95, p) * (1 - smoothstep(0.95, 1, p)));
    if (veil) veil.style.opacity = String(light * 0.92);
    orrery.style.setProperty('--converge', converge.toFixed(3));

    if (climax) {
      const reveal = smoothstep(0.86, 0.98, p);
      climax.style.setProperty('--reveal', reveal.toFixed(3));
      climax.classList.toggle('is-visible', reveal > 0.05);
    }

    if (!struck && p > 0.87) {
      struck = true;
      soundscape.bell();
      soundscape.pulse(0.6);
    }
    if (struck && p < 0.7) struck = false;
  });
}
