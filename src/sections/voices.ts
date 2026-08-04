import { eyebrow, hasPhoto, photo } from '../ui';
import { RESPONSES, TESTIMONIALS } from '../content/testimonials';
import { ticker } from '../core/ticker';
import { viewport } from '../core/scroll';
import { clamp01 } from '../gl/math';

/** A soft, slowly breathing trace behind each account. */
function waveform(seed: number): string {
  const points: string[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 320;
    const envelope = Math.sin((i / steps) * Math.PI);
    const a = Math.sin(i * 0.31 + seed * 1.7) * 9;
    const b = Math.sin(i * 0.71 + seed * 3.1) * 5;
    const c = Math.sin(i * 1.43 + seed * 0.9) * 2.5;
    const y = 20 + (a + b + c) * envelope * 0.55;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

export function voicesMarkup(): string {
  const attributed = TESTIMONIALS.map((item, index) => {
    const body = item.quote
      ? `<blockquote class="voice__quote"><p>&ldquo;${item.quote}&rdquo;</p></blockquote>`
      : `<p class="voice__quote voice__quote--account">${item.account ?? ''}</p>`;
    return `
      <li class="voice voice--named" data-voice="${index}">
        <svg class="voice__wave" viewBox="0 0 320 40" aria-hidden="true" focusable="false">
          <polyline points="${waveform(index)}" fill="none" stroke="currentColor" stroke-width="0.8" />
        </svg>
        <figure>
          ${body}
          <figcaption class="voice__by">
            <span class="voice__name">${item.name}</span>
            ${
              [item.location, item.excursion]
                .filter(Boolean)
                .map((part) => `<span class="voice__place">${part}</span>`)
                .join('')
            }
          </figcaption>
        </figure>
      </li>`;
  }).join('');

  const responses = RESPONSES.map(
    (item, index) => `
    <li class="voice" data-voice="${TESTIMONIALS.length + index}" style="--depth:${
      (index % 3) / 2
    }">
      <svg class="voice__wave" viewBox="0 0 320 40" aria-hidden="true" focusable="false">
        <polyline points="${waveform(index + 7)}" fill="none" stroke="currentColor" stroke-width="0.8" />
      </svg>
      <p class="voice__register field-label">${item.register}</p>
      <p class="voice__line">${item.line}</p>
    </li>`,
  ).join('');

  return `
  <section class="section section--voices" id="voices" aria-labelledby="voices-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>
    <div class="shell voices__grid">
      <div class="voices__head">
        ${eyebrow('On the land', '06')}
        <h2 class="display display--m" id="voices-title" data-reveal>
          What people felt on the land
        </h2>
        <p class="note" data-reveal>
          Accounts gathered from previous excursions. Experiences differ, and no particular
          response is assured.
        </p>
        ${
          // "Previous excursion" is a documentary claim. It may only sit under
          // an actual photograph, never under the procedural stand-in.
          hasPhoto('group-temple')
            ? `<figure class="voices__gathering" data-reveal="fade">
          ${photo('group-temple', { crop: 'wide', sizes: '(max-width: 1023px) 90vw, 30vw' })}
          <figcaption class="field-label">Previous excursion</figcaption>
        </figure>`
            : ''
        }
      </div>
      <ul class="voices" id="voices-list">${attributed}${responses}</ul>
    </div>
  </section>`;
}

export function initVoices(reducedMotion: boolean): void {
  const list = document.getElementById('voices-list');
  if (!list || reducedMotion) return;
  const items = Array.from(list.querySelectorAll<HTMLElement>('.voice'));

  ticker.add(() => {
    // Each account emerges from where it is on screen rather than from a
    // schedule across the section. The list changes length whenever an account
    // is added, and a fixed schedule leaves the first entries dark while they
    // are in full view.
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const local = clamp01((viewport.height * 0.92 - rect.top) / (viewport.height * 0.3));
      item.style.setProperty('--emerge', local.toFixed(3));
    });
  });
}
