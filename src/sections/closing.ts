import { cta, eyebrow } from '../ui';
import { glyphMarkup } from '../content/glyphs';
import { ticker } from '../core/ticker';
import { elementProgress } from '../core/scroll';
import { clamp01, smoothstep } from '../gl/math';

export function resolutionMarkup(): string {
  return `
  <section class="section section--resolution" id="resolution" aria-labelledby="resolution-title">
    <div class="scrim scrim--bottom" aria-hidden="true"></div>
    <div class="shell resolution__grid">
      <div class="resolution__copy">
        ${eyebrow('The still point', '10')}
        <h2 class="display display--m" id="resolution-title" data-reveal>
          You can choose how you meet them
        </h2>
        <div class="prose" data-reveal>
          <p>
            You cannot control every force moving through the years ahead. You can choose how you
            meet them.
          </p>
          <p class="verse">
            <span>Come to China.</span>
            <span>Walk the terrain where the classical arts began.</span>
            <span>Experience Qi at its source.</span>
            <span>Stand on sacred ground at a selected time.</span>
          </p>
          <p>Return carrying something that cannot be received through a screen.</p>
        </div>
      </div>

      <div class="resolution__card" data-reveal>
        <p class="resolution__title">Joey Yap's China Excursion 2026</p>
        <p class="resolution__dates">
          <time datetime="2026-09-10">10</time> to <time datetime="2026-09-15">15 September 2026</time>
        </p>
        <p class="resolution__status"><span class="pip" aria-hidden="true"></span> Reservations now open</p>
        <div class="resolution__action">
          ${cta({
            label: 'Speak With The Journey Team',
            size: 'large',
            magnetic: true,
            describedBy: 'resolution-microcopy',
          })}
          <p class="cta-note" id="resolution-microcopy">
            Begin with a private conversation. The team will explain the experience, confirm
            current availability, and guide you through the reservation process.
          </p>
        </div>
      </div>
    </div>
  </section>`;
}

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'Do I need prior knowledge of Feng Shui or Chinese metaphysics?',
    a: 'No prior study is required. The excursion is intended for experienced practitioners, complete beginners, and anyone prepared to experience the land directly.',
  },
  {
    q: 'What happens during the excursion?',
    a: 'The experience includes guided observation of classical landforms, teaching from Joey, meditation, selected activations, and direct experience of Qi within significant environments. The complete itinerary is shared privately during the reservation process.',
  },
  {
    q: 'Where in China will we travel?',
    a: 'The specific sacred sites and route remain private. The team will provide the appropriate details during the reservation conversation.',
  },
  {
    q: 'Is this a premium travel experience?',
    a: 'The excursion is designed as a premium, privately curated experience with close attention given to the practical details of the trip. The land, timing, teaching, and personal experience form the centre of the programme.',
  },
  {
    q: 'Does everyone experience Qi in the same way?',
    a: 'Experiences differ. Previous participants have described warmth, tingling, tranquillity, renewed energy, emotional release, and a deeper understanding of the land. No particular response is assured.',
  },
  {
    q: 'How do I reserve a place?',
    a: 'Reservations begin with a private conversation with the China Excursion team. The team will explain the experience, answer questions, confirm current availability, and guide you through the next step.',
  },
];

export function faqMarkup(): string {
  const items = FAQS.map(
    (item, index) => `
    <details class="faq__item" name="faq" ${index === 0 ? 'open' : ''}>
      <summary class="faq__q">
        <span class="faq__index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="faq__text">${item.q}</span>
        <span class="faq__mark" aria-hidden="true"></span>
      </summary>
      <div class="faq__a"><p>${item.a}</p></div>
    </details>`,
  ).join('');

  return `
  <section class="section section--faq" id="faq" aria-labelledby="faq-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>
    <div class="shell faq__grid">
      <div class="faq__head">
        ${eyebrow('Questions', '11')}
        <h2 class="display display--s" id="faq-title" data-reveal>Before you speak with the team</h2>
        <div class="faq__cta" data-reveal>
          ${cta({ label: 'Contact The Journey Team', variant: 'ghost' })}
        </div>
      </div>
      <div class="faq__list" data-reveal>${items}</div>
    </div>
  </section>`;
}

export function finalMarkup(): string {
  return `
  <section class="section section--final" id="final" aria-labelledby="final-title">
    <div class="scrim scrim--full" aria-hidden="true"></div>
    <div class="shell final__inner">
      <p class="final__glyph" aria-hidden="true">${glyphMarkup('dragon')}</p>
      <h2 class="display display--l final__title" id="final-title" data-reveal>
        The Dragon is moving
      </h2>
      <p class="final__dates" data-reveal>
        <time datetime="2026-09-10">10</time> to <time datetime="2026-09-15">15 September 2026</time>
      </p>
      <p class="final__status" data-reveal>Reservations are open</p>
      <div class="final__action" data-reveal>
        ${cta({ label: 'Begin The Conversation', size: 'large', magnetic: true })}
      </div>
    </div>
  </section>`;
}

export function footerMarkup(): string {
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <div class="shell site-footer__inner">
      <p class="site-footer__mark">
        <span class="glyph-mark">${glyphMarkup('qi')}</span>
        Joey Yap's China Excursion 2026
      </p>
      <p class="site-footer__meta">
        10 to 15 September 2026 <span aria-hidden="true">&middot;</span> Reservations now open
      </p>
      <p class="site-footer__legal">&copy; ${year} Joey Yap. All rights reserved.</p>
    </div>
  </footer>`;
}

export function initClosing(reducedMotion: boolean): void {
  const final = document.getElementById('final');
  if (!final || reducedMotion) return;
  const title = final.querySelector<HTMLElement>('.final__title');
  ticker.add(() => {
    const p = clamp01(elementProgress(final));
    // The closing line settles into place rather than arriving all at once.
    const t = smoothstep(0.2, 0.75, p);
    if (title) {
      title.style.letterSpacing = `${(-0.022 + (1 - t) * 0.03).toFixed(4)}em`;
      title.style.fontVariationSettings = `'opsz' 72, 'wght' ${(220 + t * 90).toFixed(0)}`;
    }
  });
}
