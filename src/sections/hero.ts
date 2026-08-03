import { cta } from '../ui';
import { glyphMarkup } from '../content/glyphs';
import { ticker } from '../core/ticker';
import { viewport } from '../core/scroll';
import { clamp01 } from '../gl/math';

export function heroMarkup(): string {
  return `
  <section class="section section--hero" id="hero" aria-labelledby="hero-title">
    <div class="scrim scrim--hero" aria-hidden="true"></div>
    <div class="hero__grid shell">
      <p class="hero__eyebrow" data-reveal="fade">
        <span class="glyph-mark">${glyphMarkup('dragon')}</span>
        Joey Yap's China Excursion 2026
      </p>

      <h1 class="display display--xl hero__title" id="hero-title">
        <span class="hero__word" data-reveal="line">Walk</span>
        <span class="hero__word" data-reveal="line">The</span>
        <span class="hero__word hero__word--accent" data-reveal="line">Dragon</span>
      </h1>

      <p class="lede hero__lede" data-reveal>
        Stand on sacred ground. Experience Qi at its source.
      </p>

      <div class="hero__body prose prose--tight" data-reveal>
        <p>
          For six days, leave the ordinary world behind and enter the mountains of China with
          Dato' Joey Yap.
        </p>
        <p class="verse">
          <span>Walk ancient landforms.</span>
          <span>Experience the living terrain behind classical Feng Shui.</span>
          <span>Meditate where the Qi of Heaven and Earth gathers.</span>
        </p>
        <p class="hero__aside">
          Some places can be visited.<br />
          A few must be experienced at the right moment.
        </p>
      </div>

      <div class="hero__foot">
        <dl class="hero__dates" data-reveal>
          <div>
            <dt>Dates</dt>
            <dd><time datetime="2026-09-10">10</time> to <time datetime="2026-09-15">15 September 2026</time></dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Reservations now open</dd>
          </div>
        </dl>

        <div class="hero__action" data-reveal>
          ${cta({
            label: 'Speak With The Journey Team',
            size: 'large',
            magnetic: true,
            describedBy: 'hero-microcopy',
          })}
          <p class="cta-note" id="hero-microcopy">
            Private reservations for a limited group of guests.
          </p>
        </div>
      </div>
    </div>

    <a class="scroll-cue" href="#land" aria-label="Begin the journey">
      <span class="scroll-cue__label">Follow the Dragon</span>
      <span class="scroll-cue__line" aria-hidden="true"></span>
    </a>
  </section>`;
}

export function initHero(reducedMotion: boolean): void {
  const title = document.querySelector<HTMLElement>('.hero__title');
  const hero = document.getElementById('hero');
  if (!title || !hero || reducedMotion) return;

  // The display weight thins very slightly as the hero leaves, so the type
  // recedes with the camera rather than simply scrolling away.
  ticker.add(() => {
    const rect = hero.getBoundingClientRect();
    const t = clamp01(-rect.top / (viewport.height || 1));
    title.style.fontVariationSettings = `'opsz' 72, 'wght' ${(300 - t * 90).toFixed(0)}`;
    title.style.opacity = String(1 - t * 0.75);
    title.style.transform = `translate3d(0, ${(t * -40).toFixed(1)}px, 0)`;
  });
}
