import { eyebrow } from '../ui';
import type { Narrative } from '../core/narrative';
import { elementProgress } from '../core/scroll';
import { clamp01, smoothstep } from '../gl/math';
import { ticker } from '../core/ticker';

interface Stage {
  key: string;
  label: string;
  reading: string;
}

const STAGES: Stage[] = [
  { key: 'vein', label: 'Dragon vein', reading: 'Qi enters the range' },
  { key: 'embrace', label: 'Embrace', reading: 'the formation closes' },
  { key: 'water', label: 'Water', reading: 'the course arrives' },
  { key: 'instrument', label: 'Direction', reading: 'bearing and timing' },
  { key: 'converge', label: 'Convergence', reading: 'the Qi settles' },
  { key: 'meridian', label: 'Meridian Spot', reading: 'the point itself' },
];

export function dragonMarkup(): string {
  const readout = STAGES.map(
    (stage, index) => `
    <li class="readout__item" data-stage="${index}">
      <span class="readout__index">${String(index + 1).padStart(2, '0')}</span>
      <span class="readout__body">
        <span class="readout__label">${stage.label}</span>
        <span class="readout__reading">${stage.reading}</span>
      </span>
      <span class="readout__bar" aria-hidden="true"><i></i></span>
    </li>`,
  ).join('');

  return `
  <section class="section section--dragon" id="dragon" aria-labelledby="dragon-title">
    <div class="scrim scrim--left" aria-hidden="true"></div>
    <div class="shell dragon__grid">
      <div class="dragon__copy">
        ${eyebrow('The Dragon and the Meridian Spot', '02')}
        <h2 class="display display--m" id="dragon-title" data-reveal>The land is alive</h2>

        <article class="dragon__block" data-stage="0">
          <h3 class="dragon__sub" data-reveal>The Dragon</h3>
          <div class="prose" data-reveal>
            <p>
              In classical Feng Shui, mountain ranges are read as Dragons. The Dragon carries Qi
              through the landscape. Its movement, direction, form, and quality reveal the
              potential held within the land.
            </p>
          </div>
        </article>

        <article class="dragon__block" data-stage="1">
          <p class="verse" data-reveal>
            <span>Some Dragons rise with force.</span>
            <span>Some gather slowly.</span>
            <span>Some travel across great distances before settling.</span>
          </p>
        </article>

        <article class="dragon__block" data-stage="2">
          <div class="prose" data-reveal>
            <p>
              Learning to recognise the Dragon changes the way a person sees a mountain.
            </p>
          </div>
        </article>

        <article class="dragon__block" data-stage="3">
          <h3 class="dragon__sub" data-reveal>The Meridian Spot</h3>
          <div class="prose" data-reveal>
            <p>
              A Meridian Spot is the place where beneficial Qi within the surrounding landform
              gathers.
            </p>
          </div>
        </article>

        <article class="dragon__block" data-stage="4">
          <p class="verse" data-reveal>
            <span>The Dragon arrives.</span>
            <span>The mountains embrace.</span>
            <span>Water completes the formation.</span>
            <span>The Qi settles.</span>
          </p>
          <div class="prose" data-reveal>
            <p>
              Finding this point requires an understanding of the complete environment and the
              relationships between every feature around it.
            </p>
          </div>
        </article>

        <article class="dragon__block" data-stage="5">
          <div class="prose" data-reveal>
            <p>
              When Joey brings the group onto sacred ground, the subject is no longer theoretical.
            </p>
            <p class="verse">
              <span>You see where the Dragon travelled.</span>
              <span>You see where it stopped.</span>
              <span>You stand where the Qi gathers.</span>
            </p>
          </div>
        </article>
      </div>

      <div class="dragon__instrument">
        <div class="instrument">
          <p class="field-label instrument__title">Landform reading</p>
          <ol class="readout">${readout}</ol>
          <svg class="instrument__dial" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <g class="dial__rings" fill="none" stroke="currentColor">
              <circle cx="100" cy="100" r="86" stroke-width="0.4" opacity="0.35" />
              <circle cx="100" cy="100" r="66" stroke-width="0.4" opacity="0.25" />
              <circle class="dial__live" cx="100" cy="100" r="48" stroke-width="0.7" />
              <circle cx="100" cy="100" r="26" stroke-width="0.4" opacity="0.4" />
            </g>
            <g class="dial__ticks" stroke="currentColor" stroke-width="0.4" opacity="0.5"></g>
            <path class="dial__vein" d="M14 128 C 48 118 62 92 92 84 C 120 77 140 92 164 78" fill="none" stroke="currentColor" stroke-width="1" />
            <path class="dial__water" d="M20 158 C 58 150 84 158 112 150 C 142 141 164 148 186 140" fill="none" stroke="currentColor" stroke-width="0.8" />
            <circle class="dial__spot" cx="100" cy="100" r="4" fill="currentColor" />
          </svg>
          <p class="instrument__caption" aria-hidden="true">
            <span class="field-label">Reading</span>
            <span class="instrument__value" id="instrument-value">Dragon vein</span>
          </p>
        </div>
      </div>
    </div>
  </section>`;
}

export function initDragon(narrative: Narrative): void {
  const section = document.getElementById('dragon');
  if (!section) return;

  const items = Array.from(section.querySelectorAll<HTMLElement>('.readout__item'));
  const value = document.getElementById('instrument-value');
  const dial = section.querySelector<SVGElement>('.instrument__dial');
  const ticks = section.querySelector<SVGGElement>('.dial__ticks');

  if (ticks) {
    // Bearing marks, drawn once rather than shipped as markup.
    const marks: string[] = [];
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      const long = i % 6 === 0;
      const r1 = long ? 74 : 79;
      const r2 = 86;
      marks.push(
        `<line x1="${(100 + Math.cos(angle) * r1).toFixed(2)}" y1="${(
          100 +
          Math.sin(angle) * r1
        ).toFixed(2)}" x2="${(100 + Math.cos(angle) * r2).toFixed(2)}" y2="${(
          100 +
          Math.sin(angle) * r2
        ).toFixed(2)}"${long ? ' opacity="1"' : ''} />`,
      );
    }
    ticks.innerHTML = marks.join('');
  }

  const progressOf = () => clamp01((elementProgress(section) - 0.12) / 0.72);

  narrative.addModifier((state) => {
    const p = progressOf();
    if (p <= 0 || p >= 1) return;
    state.vein = Math.max(state.vein, smoothstep(0.02, 0.2, p));
    state.embrace = Math.max(state.embrace, smoothstep(0.2, 0.4, p));
    state.waterFade = Math.max(state.waterFade, smoothstep(0.36, 0.56, p));
    state.rings = Math.max(state.rings, smoothstep(0.52, 0.72, p));
    state.meridian = Math.max(state.meridian, smoothstep(0.66, 0.88, p));
    if (p > 0.84) {
      // A pulse so slight it reads as the ground breathing.
      const beat = Math.sin(performance.now() * 0.0016) * 0.5 + 0.5;
      state.meridian += beat * 0.14;
      state.exposure += beat * 0.02;
    }
  });

  let current = -1;
  ticker.add(() => {
    const p = progressOf();
    const index = Math.min(STAGES.length - 1, Math.floor(p * STAGES.length));
    const local = clamp01(p * STAGES.length - index);

    items.forEach((item, i) => {
      item.classList.toggle('is-active', i === index && p > 0 && p < 1);
      item.classList.toggle('is-passed', i < index);
      const bar = item.querySelector<HTMLElement>('.readout__bar i');
      if (bar) bar.style.transform = `scaleX(${i < index ? 1 : i === index ? local : 0})`;
    });

    if (index !== current && p > 0 && p < 1) {
      current = index;
      if (value) value.textContent = STAGES[index]?.label ?? '';
      dial?.setAttribute('data-stage', String(index));
    }
  });
}
