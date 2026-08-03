import { cta, eyebrow, plate } from '../ui';
import { annotationsMarkup, initAnnotations, type Annotation } from './annotations';
import type { Stage } from '../gl/stage';
import { elementProgress } from '../core/scroll';
import { clamp01, smoothstep } from '../gl/math';

export const LAND_ANNOTATIONS: Annotation[] = [
  { label: 'Dragon', reading: 'the range carrying Qi', world: [-46, 74, -6] },
  { label: 'Embrace', reading: 'formation enclosing the site', world: [-55, 62, -13] },
  { label: 'Water', reading: 'the course completing it', world: [4, 5, -36] },
  { label: 'Meridian', reading: 'where the Qi settles', world: [0, 20, 7] },
];

export function landMarkup(): string {
  return `
  <section class="section section--land" id="land" aria-labelledby="land-title">
    <div class="scrim scrim--left" aria-hidden="true"></div>
    ${annotationsMarkup('land-annotations', LAND_ANNOTATIONS)}

    <div class="shell land__grid">
      <div class="land__copy">
        ${eyebrow('The land teaches', '01')}
        <h2 class="display display--m" id="land-title" data-reveal>
          Some knowledge can only be received from the land
        </h2>

        <div class="prose land__prose" data-reveal>
          <p>
            There are things Joey can teach in a classroom. There are things that only become
            real when you stand before the mountain itself.
          </p>
          <p class="verse">
            <span>The rise and fall of the Dragon.</span>
            <span>The embrace of the surrounding land.</span>
            <span>The movement of water.</span>
            <span>The point where Qi settles.</span>
          </p>
          <p>
            For centuries, masters observed these formations directly. They studied how mountains
            carry Qi, where it gathers, and how the right place influences the people who live,
            build, meditate, work, or rest upon it.
          </p>
          <p class="land__pair">
            <span>Books preserve the method.</span>
            <span>The land reveals its scale.</span>
          </p>
          <p>
            On the China Excursion, Joey reads the terrain in front of you. Lines from a diagram
            become mountains you can walk through, touch, and feel.
          </p>
        </div>

        <div class="land__action" data-reveal>
          ${cta({ label: 'Reserve A Private Conversation', magnetic: true })}
        </div>
      </div>

      <div class="land__studies" aria-hidden="false">
        <figure class="study study--a" data-reveal="fade">
          <div class="study__frame">
            ${plate(
              'ridge-study',
              'A mountain ridge in ink and mist, its crest line traced by a thin band of gold light.',
              { sizes: '(max-width: 899px) 88vw, 34vw' },
            )}
            <svg class="study__contours" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
              <g fill="none" stroke="currentColor" stroke-width="0.5">
                <path d="M-10 210 C 60 196 96 172 150 150 C 196 131 232 138 276 156 C 320 174 366 186 410 182" />
                <path d="M-10 232 C 64 220 104 196 158 176 C 204 159 240 166 282 182 C 326 199 368 208 410 204" opacity="0.7" />
                <path d="M-10 254 C 68 244 112 222 166 202 C 212 185 248 192 288 208 C 330 225 370 230 410 226" opacity="0.45" />
                <path d="M-10 188 C 56 172 90 148 142 124 C 188 103 226 110 268 130 C 312 151 364 166 410 160" opacity="0.3" />
              </g>
            </svg>
          </div>
          <figcaption class="study__caption">
            <span class="field-label">Observation</span>
            The crest reveals the direction of travel before anything else.
          </figcaption>
        </figure>

        <figure class="study study--b" data-reveal="fade">
          <div class="study__frame">
            ${plate(
              'basin-study',
              'A high basin seen from above, held by a ring of peaks, with surveying marks drawn across the ground.',
              { sizes: '(max-width: 899px) 72vw, 26vw' },
            )}
          </div>
          <figcaption class="study__caption">
            <span class="field-label">Observation</span>
            Where the range slows, the ground begins to gather.
          </figcaption>
        </figure>
      </div>
    </div>
  </section>`;
}

export function initLand(stage: Stage | null): void {
  const section = document.getElementById('land');
  if (!section) return;
  initAnnotations('land-annotations', LAND_ANNOTATIONS, stage, () => {
    const p = elementProgress(section);
    return clamp01(smoothstep(0.16, 0.34, p) * (1 - smoothstep(0.78, 0.95, p)));
  });
}
