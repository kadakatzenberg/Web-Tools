import { cta, eyebrow, photo, plate } from '../ui';
import { ticker } from '../core/ticker';
import { stickyProgress, viewport } from '../core/scroll';
import { clamp01, lerp } from '../gl/math';

interface Chapter {
  chapter: string;
  title: string;
  body: string;
  /** A photograph role, or a procedural plate when the chapter is mythic. */
  media: { kind: 'photo'; role: string; crop?: string } | { kind: 'plate'; name: string; alt: string };
  /** Frame proportion, so no two chapters are the same shape. */
  shape: 'portrait' | 'landscape' | 'square' | 'tall';
  treatment?: 'ink' | 'aperture' | 'strip' | 'field' | 'stele';
}

const CHAPTERS: Chapter[] = [
  {
    chapter: 'Leaving the modern world',
    title: 'Personally curated by Joey Yap',
    body: 'Joey selects the terrain, timing, and teachings that define the experience. Throughout the excursion, he reads the land in real time and shows how the classical principles appear across the mountains, waterways, and formations before the group.',
    media: { kind: 'photo', role: 'joey-briefing', crop: 'wide' },
    shape: 'landscape',
    treatment: 'field',
  },
  {
    chapter: 'First sight of the Dragon',
    title: 'Sacred ground away from the crowds',
    body: 'The experience reaches beyond conventional tourism routes. The exact sacred sites remain private. Each location is selected for what the land can reveal and what may be experienced there.',
    media: {
      kind: 'plate',
      name: 'chapter-firstsight',
      alt: 'A long mountain range emerging through mist, its crest running unbroken across the frame with light gathering along it.',
    },
    shape: 'tall',
  },
  {
    chapter: 'Reading the living terrain',
    title: 'Classical Feng Shui made visible',
    body: 'Mountains become Dragons. Valleys become channels of Qi. Water reveals how energy gathers, moves, or escapes. The land becomes the lesson.',
    media: { kind: 'photo', role: 'terrain-reading', crop: 'portrait' },
    shape: 'portrait',
    treatment: 'strip',
  },
  {
    chapter: 'Entering sacred ground',
    title: 'Meditation and activation',
    body: 'At selected locations and moments, the group pauses. Participants may meditate, set an intention, perform an activation, or experience the environment without distraction.',
    media: { kind: 'photo', role: 'group-temple', crop: 'square' },
    shape: 'square',
    treatment: 'ink',
  },
  {
    chapter: 'Reaching the selected moment',
    title: 'A private international circle',
    body: 'The excursion brings together a small group of business owners, professionals, practitioners, and seekers from different parts of the world.',
    media: { kind: 'photo', role: 'meditation-stone', crop: 'portrait' },
    shape: 'portrait',
    treatment: 'aperture',
  },
  {
    chapter: 'Returning with a changed perspective',
    title: 'Premium care throughout',
    body: 'The experience is handled with the care expected of a premium private programme.',
    media: {
      kind: 'plate',
      name: 'chapter-return',
      alt: 'The range seen from a greater distance, quiet and settled, a thin line of light running through it.',
    },
    shape: 'landscape',
  },
];

export function experienceMarkup(): string {
  const panels = CHAPTERS.map(
    (item, index) => `
    <li class="chapter chapter--${item.shape}" data-chapter="${index}">
      <div class="chapter__media">
        <span class="chapter__aperture" aria-hidden="true"></span>
        ${
          item.media.kind === 'photo'
            ? photo(item.media.role, {
                crop: item.media.crop,
                sizes: '(max-width: 899px) 88vw, 34vw',
                treatment: item.treatment,
              })
            : plate(item.media.name, item.media.alt, {
                sizes: '(max-width: 899px) 88vw, 34vw',
              })
        }
      </div>
      <div class="chapter__text">
        <p class="chapter__index"><span class="field-label">Day ${index + 1}</span> ${
          item.chapter
        }</p>
        <h3 class="chapter__title">${item.title}</h3>
        <p class="chapter__body">${item.body}</p>
      </div>
    </li>`,
  ).join('');

  return `
  <section class="section section--experience" id="experience" aria-labelledby="experience-title">
    <div class="scrim scrim--bottom" aria-hidden="true"></div>
    <div class="shell experience__head">
      ${eyebrow('The experience', '05')}
      <h2 class="display display--m" id="experience-title" data-reveal>
        Six days outside ordinary time
      </h2>
      <p class="note experience__note" data-reveal>
        The full itinerary and reservation details are shared privately by the team.
      </p>
    </div>

    <div class="experience__track" id="experience-track">
      <div class="experience__stick">
        <div class="experience__ground" aria-hidden="true"></div>
        <ol class="chapters" id="chapters">${panels}</ol>
        <div class="experience__progress" aria-hidden="true">
          <span class="experience__progress-fill" id="experience-progress"></span>
        </div>
      </div>
    </div>

    <div class="shell experience__foot" data-reveal>
      ${cta({ label: 'Speak With The Journey Team', size: 'large', magnetic: true })}
    </div>
  </section>`;
}

export function initExperience(): void {
  const track = document.getElementById('experience-track');
  const list = document.getElementById('chapters');
  const fill = document.getElementById('experience-progress');
  if (!track || !list) return;

  const horizontal = () => matchMedia('(min-width: 900px)').matches;
  const panels = Array.from(list.querySelectorAll<HTMLElement>('.chapter'));

  ticker.add(() => {
    if (!horizontal()) {
      list.style.transform = '';
      return;
    }
    const p = stickyProgress(track);
    const distance = Math.max(0, list.scrollWidth - viewport.width);
    list.style.transform = `translate3d(${(-distance * p).toFixed(1)}px, 0, 0)`;
    if (fill) fill.style.transform = `scaleX(${clamp01(p)})`;

    // Panels lift slightly as they pass the centre of the screen.
    const centre = viewport.width / 2;
    panels.forEach((panel) => {
      const rect = panel.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      const offset = clamp01(1 - Math.abs(mid - centre) / (viewport.width * 0.7));
      panel.style.setProperty('--focus', offset.toFixed(3));
      panel.style.setProperty('--lift', `${lerp(18, 0, offset).toFixed(1)}px`);
    });
  });
}
