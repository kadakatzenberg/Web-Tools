import { GLYPHS } from '../content/glyphs';

/**
 * The preloader covers real preparation: fonts, the heightmap pass and the
 * first compiled shaders. It never runs on a fixed timer, and it offers a way
 * out if preparation takes longer than it should.
 */
export function preloaderMarkup(): string {
  return `
  <div class="preloader" id="preloader" role="status" aria-live="polite">
    <div class="preloader__inner">
      <p class="preloader__glyphs" aria-hidden="true">
        <svg class="glyph" viewBox="0 0 1000 970"><g transform="translate(0 870) scale(1 -1)"><path d="${GLYPHS.heaven.path}"/></g></svg>
        <i></i>
        <svg class="glyph" viewBox="0 0 1000 970"><g transform="translate(0 870) scale(1 -1)"><path d="${GLYPHS.earth.path}"/></g></svg>
        <i></i>
        <svg class="glyph" viewBox="0 0 1000 970"><g transform="translate(0 870) scale(1 -1)"><path d="${GLYPHS.human.path}"/></g></svg>
      </p>
      <p class="preloader__triad">Heaven <span aria-hidden="true">&middot;</span> Earth <span aria-hidden="true">&middot;</span> Human</p>

      <svg class="preloader__ridge" viewBox="0 0 900 220" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="ridge-ink" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#3d444d" stop-opacity="0.15" />
            <stop offset="0.35" stop-color="#8d9299" stop-opacity="0.9" />
            <stop offset="1" stop-color="#3d444d" stop-opacity="0.15" />
          </linearGradient>
          <radialGradient id="ridge-spot">
            <stop offset="0" stop-color="#ffe6ad" />
            <stop offset="0.45" stop-color="#c9a24a" stop-opacity="0.65" />
            <stop offset="1" stop-color="#c9a24a" stop-opacity="0" />
          </radialGradient>
        </defs>
        <path class="preloader__line" d="M0 168 C 82 166 118 158 168 138 C 214 120 244 96 292 74 C 330 57 356 62 386 82 C 420 105 442 132 476 146 C 508 159 536 150 566 130 C 604 105 632 68 674 54 C 716 40 748 62 786 92 C 822 120 858 142 900 150" fill="none" stroke="url(#ridge-ink)" stroke-width="1.25" />
        <path class="preloader__line preloader__line--2" d="M0 190 C 96 188 150 178 214 160 C 268 145 306 126 356 118 C 404 110 440 124 486 140 C 534 157 574 172 626 168 C 682 164 720 140 772 128 C 826 116 866 124 900 134" fill="none" stroke="url(#ridge-ink)" stroke-width="0.9" opacity="0.55" />
        <circle class="preloader__spot" cx="386" cy="82" r="30" fill="url(#ridge-spot)" />
      </svg>

      <p class="preloader__status" id="preloader-status">The Dragon is moving</p>

      <div class="preloader__meter" aria-hidden="true">
        <span class="preloader__meter-fill" id="preloader-meter"></span>
      </div>
      <p class="visually-hidden" id="preloader-progress">Preparing the landscape</p>

      <button class="preloader__skip" id="preloader-skip" type="button" hidden>
        Enter the page
      </button>
    </div>
  </div>`;
}

export interface PreloaderHandle {
  setProgress(value: number): void;
  finish(): Promise<void>;
  onSkip(fn: () => void): void;
}

export function initPreloader(): PreloaderHandle {
  const root = document.getElementById('preloader');
  const meter = document.getElementById('preloader-meter');
  const skip = document.getElementById('preloader-skip') as HTMLButtonElement | null;
  const progressLabel = document.getElementById('preloader-progress');
  let settled = false;
  let skipHandler: (() => void) | null = null;

  const skipTimer = window.setTimeout(() => {
    if (!settled && skip) skip.hidden = false;
  }, 3600);

  skip?.addEventListener('click', () => {
    skipHandler?.();
  });

  return {
    setProgress(value: number) {
      const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
      if (meter) meter.style.transform = `scaleX(${pct / 100})`;
      if (progressLabel) progressLabel.textContent = `Preparing the landscape, ${pct}%`;
    },
    onSkip(fn: () => void) {
      skipHandler = fn;
    },
    finish() {
      settled = true;
      window.clearTimeout(skipTimer);
      if (!root) return Promise.resolve();
      root.classList.add('is-leaving');
      return new Promise<void>((resolve) => {
        window.setTimeout(() => {
          root.remove();
          document.getElementById('boot')?.remove();
          resolve();
        }, 1150);
      });
    },
  };
}
