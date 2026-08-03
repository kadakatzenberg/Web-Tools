import { eyebrow, hasPhoto, photo, plate } from '../ui';
import { onFirstView } from '../core/reveal';
import { FIGURES, FIGURES_CONFIRMED, STANDING } from '../content/authority';

export function guideMarkup(): string {
  const marks = FIGURES_CONFIRMED
    ? FIGURES.map(
        (mark, index) => `
    <li class="mark-stat" data-mark="${index}">
      <span class="mark-stat__rule" aria-hidden="true"></span>
      <p class="mark-stat__figure">
        ${mark.prefix ? `<span class="mark-stat__prefix">${mark.prefix}</span>` : ''}
        <span class="numeral" data-value="${mark.value}" data-display="${mark.display}">${
          mark.display
        }</span>
      </p>
      <p class="mark-stat__label">${mark.label}</p>
      <p class="mark-stat__reading">${mark.reading}</p>
    </li>`,
      ).join('')
    : STANDING.map(
        (mark, index) => `
    <li class="mark-stat mark-stat--standing" data-mark="${index}">
      <span class="mark-stat__rule" aria-hidden="true"></span>
      <p class="mark-stat__figure"><span class="mark-stat__mark">${mark.mark}</span></p>
      <p class="mark-stat__label">${mark.label}</p>
      <p class="mark-stat__reading">${mark.reading}</p>
    </li>`,
      ).join('');

  return `
  <section class="section section--guide" id="guide" aria-labelledby="guide-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>

    <div class="shell guide__scale">
      ${eyebrow('Your guide to the land', '07')}
      <figure class="guide__figure guide__figure--peopled" data-reveal="fade">
        ${
          hasPhoto('joey-figure')
            ? `<div class="guide__standing">${photo('joey-figure', {
                sizes: '(max-width: 899px) 42vw, 22vw',
              })}</div>`
            : ''
        }
        ${plate(
          'guide-scale',
          'Ranges receding into mist, one behind another, with a faint column of light rising from the furthest of them.',
          { sizes: '(max-width: 899px) 92vw, 62vw', ratio: '16 / 9' },
        )}
        <figcaption class="guide__figcaption">
          <span class="field-label">Scale</span>
          The range that taught the method, read from the ground.
        </figcaption>
      </figure>
    </div>

    <div class="shell guide__grid">
      <div class="guide__intro">
        <h2 class="display display--m" id="guide-title" data-reveal>Dato' Joey Yap</h2>
        <div class="prose" data-reveal>
          <p>
            For decades, Joey Yap has studied, practised, and taught Feng Shui, BaZi, Qi Men Dun
            Jia, and Date Selection.
          </p>
          <p>
            He has walked the terrain described in classical texts and examined the mountains,
            rivers, cities, temples, homes, and burial sites where these systems were developed
            and applied.
          </p>
          <p>On the excursion, he teaches participants how to observe what he observes.</p>
          <p class="verse">
            <span>How the Dragon approaches.</span>
            <span>How the land receives it.</span>
            <span>Where the Qi gathers.</span>
            <span>Why a place feels the way it does.</span>
          </p>
        </div>
        <p class="guide__closing display display--s" data-reveal>
          The mountain is the text. <em>Joey teaches you how to read it.</em>
        </p>
      </div>

      <ol class="marks" id="guide-marks">${marks}</ol>
    </div>
  </section>`;
}

export function initGuide(reducedMotion: boolean): void {
  const list = document.getElementById('guide-marks');
  if (!list) return;
  const numerals = Array.from(list.querySelectorAll<HTMLElement>('.numeral'));

  if (reducedMotion) return;

  numerals.forEach((el) => {
    const target = Number(el.dataset.value ?? 0);
    const display = el.dataset.display ?? '';
    el.textContent = '0';
    onFirstView(el, () => {
      const duration = 1500;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // Settles rather than stops, which suits an engraved figure.
        const eased = 1 - Math.pow(1 - t, 4);
        el.textContent =
          t >= 1 ? display : Math.round(target * eased).toLocaleString('en-GB');
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, '0px');
  });
}
