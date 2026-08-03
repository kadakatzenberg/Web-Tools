import { eyebrow } from '../ui';
import { initDrift } from './drift';
import { ticker } from '../core/ticker';
import { elementProgress } from '../core/scroll';
import { clamp01 } from '../gl/math';
import { soundscape } from '../core/audio';

export function warningMarkup(): string {
  return `
  <section class="section section--warning" id="warning" aria-labelledby="warning-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>
    <canvas class="drift" id="drift-canvas" aria-hidden="true"></canvas>

    <div class="shell warning__grid">
      <div class="warning__head">
        ${eyebrow('The turn of the year', '08')}
        <h2 class="display display--m" id="warning-title" data-reveal>
          The world is already giving the warning
        </h2>
      </div>

      <div class="prose warning__lead" data-reveal>
        <p>2026 has moved with speed.</p>
        <p>
          Markets react within hours. Technology alters entire industries before people have time
          to understand what changed. Trade, conflict, climate, and political pressure cross
          borders with little warning.
        </p>
        <p class="land__pair">
          <span>Decisions move faster.</span>
          <span>Consequences travel further.</span>
        </p>
        <p>The world keeps accelerating.</p>
      </div>

      <div class="warning__inward">
        <p class="warning__pivot display display--s" data-reveal>In 2027, the pressure moves inward.</p>
        <ul class="pressures" data-reveal>
          <li>Career</li>
          <li>Business</li>
          <li>Finances</li>
          <li>Relationships</li>
          <li>Home</li>
          <li>Direction</li>
        </ul>
      </div>

      <div class="prose warning__close" data-reveal>
        <p>
          The Fire Horse tested how quickly people could move. The Blood Goat tests whether what
          they created can hold.
        </p>
        <p>
          Whatever has been delayed, stretched, or left unsupported begins demanding attention.
          Momentum alone may no longer be enough.
        </p>
      </div>
    </div>
  </section>`;
}

export function initWarning(reducedMotion: boolean): void {
  const section = document.getElementById('warning');
  if (!section) return;

  const intensity = () => clamp01((elementProgress(section) - 0.1) / 0.62);
  initDrift('drift-canvas', intensity, reducedMotion);

  ticker.add(() => {
    const t = intensity();
    section.classList.toggle('is-contaminated', t > 0.2);
    section.style.setProperty('--corrupt', t.toFixed(3));
    soundscape.setMood(t * 0.6, 0.35 + t * 0.3);
  });
}
