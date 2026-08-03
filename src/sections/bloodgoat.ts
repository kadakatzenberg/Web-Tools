import { cta, eyebrow, splitPhrase } from '../ui';
import { ticker } from '../core/ticker';
import { stickyProgress } from '../core/scroll';
import { clamp01, lerp, smoothstep } from '../gl/math';
import { soundscape } from '../core/audio';
import type { Narrative } from '../core/narrative';

const DESCENT_LINES = [
  'The warning is already visible.',
  'The question is whether you enter 2027 carrying the same energy, habits, and unanswered questions you carry today.',
  'Or whether you take one moment before the year arrives to stop.',
  'To leave the noise behind.',
  'To stand where Heaven and Earth meet.',
  'To ask what must be asked.',
  'To release what has been carried long enough.',
  'To place your intention into the land at a time selected for it.',
];

export function bloodgoatMarkup(): string {
  const lines = DESCENT_LINES.map(
    (line, index) =>
      `<li class="descent__line" data-line="${index}"><span>${line}</span></li>`,
  ).join('');

  return `
  <section class="section section--bloodgoat" id="bloodgoat" aria-labelledby="bloodgoat-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>

    <div class="shell bloodgoat__head">
      ${eyebrow('2027', '09')}
      <h2 class="display display--l bloodgoat__title" id="bloodgoat-title" data-reveal>
        <span class="visually-hidden">The Blood Goat is coming</span>
        <span class="kinetic-line" aria-hidden="true" id="bloodgoat-kinetic">${splitPhrase([
          'The',
          'Blood Goat',
        ])}</span>
        <span class="kinetic-line kinetic-line--second" aria-hidden="true">${splitPhrase([
          'is coming',
        ])}</span>
      </h2>

      <div class="prose bloodgoat__prose" data-reveal>
        <p>
          The Goat is associated with storage. It holds resources, wealth, talent, and potential
          within the Earth.
        </p>
        <p>Fire changes the nature of that storage.</p>
        <p class="verse">
          <span>What has remained buried may be forced open.</span>
          <span>What has been ignored may become impossible to avoid.</span>
          <span>What appeared secure may reveal the pressure beneath it.</span>
        </p>
        <p>
          The Blood Goat favours the person who understands the terrain before stepping onto it.
        </p>
      </div>
    </div>

    <div class="bloodgoat__track" id="bloodgoat-track">
      <div class="bloodgoat__stick">
        <ol class="descent" id="descent">${lines}</ol>

        <div class="turn" id="turn" aria-hidden="true">
          <p class="turn__small">Before the year turns</p>
          <p class="turn__big">Walk The Dragon</p>
        </div>
      </div>
    </div>

    <div class="shell bloodgoat__foot" data-reveal>
      ${cta({ label: 'Speak With The Journey Team', size: 'large', magnetic: true })}
    </div>
  </section>`;
}

export function initBloodGoat(narrative: Narrative, reducedMotion: boolean): void {
  const track = document.getElementById('bloodgoat-track');
  const section = document.getElementById('bloodgoat');
  const descent = document.getElementById('descent');
  const turn = document.getElementById('turn');
  const veil = document.querySelector<HTMLElement>('.veil--dark');
  const kinetic = document.getElementById('bloodgoat-kinetic');
  if (!track || !section || !descent) return;

  const lines = Array.from(descent.querySelectorAll<HTMLElement>('.descent__line'));
  const chars = kinetic ? Array.from(kinetic.querySelectorAll<HTMLElement>('.char')) : [];
  let pulsed = false;
  let ducked = false;

  narrative.addModifier((state) => {
    const p = stickyProgress(track);
    if (p <= 0 || p >= 1) return;
    // Everything stops at the black frame.
    const stillness = smoothstep(0.6, 0.7, p);
    state.timeScale = lerp(state.timeScale, 0.02, stillness);
    state.instability = lerp(state.instability, 0, smoothstep(0.62, 0.72, p));
    if (p > 0.8) {
      state.flash = 0;
    }
  });

  ticker.add(() => {
    const p = stickyProgress(track);
    const inside = p > 0 && p < 1;
    section.classList.toggle('is-contaminated', p > 0.02 || elementInView(section));

    if (!inside) {
      if (ducked) {
        document.body.classList.remove('is-cursor-hidden');
        ducked = false;
      }
      document.body.classList.remove('is-hushed');
      if (veil) veil.style.opacity = '0';
      return;
    }

    // Lines arrive one after another and stay.
    lines.forEach((line, index) => {
      const start = 0.04 + (index / lines.length) * 0.5;
      const local = clamp01((p - start) / 0.09);
      const out = 1 - smoothstep(0.58, 0.66, p);
      line.style.setProperty('--in', (local * out).toFixed(3));
    });

    // Type under pressure. Width narrows and letters drift apart, but the
    // words never stop being words.
    if (chars.length) {
      const tension = smoothstep(0.0, 0.55, p);
      chars.forEach((char, index) => {
        const phase = Math.sin(index * 0.7 + p * 22) * tension;
        char.style.fontVariationSettings = `'wght' ${(
          420 + phase * 180
        ).toFixed(0)}, 'wdth' ${(100 - tension * 30 + phase * 6).toFixed(1)}`;
        char.style.transform = `translate3d(0, ${(phase * 4).toFixed(2)}px, 0)`;
      });
    }

    // The black frame.
    const black = smoothstep(0.6, 0.7, p) * (1 - smoothstep(0.82, 0.9, p));
    if (veil) veil.style.opacity = String(black);

    // The page chrome steps back for the whole held moment, so nothing but the
    // black frame and the line that follows it is on screen.
    document.body.classList.toggle('is-hushed', p > 0.55 && p < 0.97);

    const hold = p > 0.66 && p < 0.8;
    if (hold !== ducked) {
      ducked = hold;
      document.body.classList.toggle('is-cursor-hidden', hold && !reducedMotion);
      if (hold) soundscape.duck(1.2);
    }

    if (!pulsed && p > 0.56) {
      pulsed = true;
      soundscape.pulse(1);
    }
    if (pulsed && p < 0.4) pulsed = false;

    if (turn) {
      const reveal = smoothstep(0.8, 0.93, p);
      turn.style.setProperty('--reveal', reveal.toFixed(3));
      turn.classList.toggle('is-visible', reveal > 0.02);
    }
  });
}

function elementInView(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight * 0.6 && rect.bottom > 0;
}
