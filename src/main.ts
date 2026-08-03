import './styles/tokens.css';
import './styles/base.css';
import './styles/type.css';
import './styles/components.css';
import './styles/sections.css';

import { warnIfContactUnset } from './config';
import { detectCapabilities, onMotionPreferenceChange, pixelRatio } from './core/capabilities';
import { ticker } from './core/ticker';
import { initGrain } from './core/grain';
import { initCursor, initMagnetic, initPointer } from './core/pointer';
import { initPhotoSweep, initReveals } from './core/reveal';
import { initSmoothScroll, measureViewport, readScroll, viewport } from './core/scroll';
import { Narrative } from './core/narrative';
import { BEATS } from './core/beats';
import { soundscape } from './core/audio';

import { Stage } from './gl/stage';
import { fallbackMarkup, initFallback } from './gl/fallback';

import { initPreloader, preloaderMarkup } from './sections/preloader';
import { dockMarkup, initChrome, mastheadMarkup } from './sections/chrome';
import { heroMarkup, initHero } from './sections/hero';
import { initLand, landMarkup } from './sections/land';
import { dragonMarkup, initDragon } from './sections/dragon';
import { initTiming, timingMarkup } from './sections/timing';
import { audienceMarkup, initAudience } from './sections/audience';
import { experienceMarkup, initExperience } from './sections/experience';
import { initVoices, voicesMarkup } from './sections/voices';
import { guideMarkup, initGuide } from './sections/guide';
import { initWarning, warningMarkup } from './sections/warning';
import { bloodgoatMarkup, initBloodGoat } from './sections/bloodgoat';
import {
  faqMarkup,
  finalMarkup,
  footerMarkup,
  initClosing,
  resolutionMarkup,
} from './sections/closing';

const capabilities = detectCapabilities();

document.body.innerHTML = `
  <a class="skip-link" href="#hero">Skip to the main content</a>

  <div class="stage" id="stage" aria-hidden="true">
    <canvas class="stage__canvas" id="stage-canvas"></canvas>
    ${fallbackMarkup()}
  </div>
  <div class="grain" aria-hidden="true"></div>
  <div class="veil veil--dark" aria-hidden="true"></div>
  <div class="veil veil--light" aria-hidden="true"></div>

  ${preloaderMarkup()}
  ${mastheadMarkup()}

  <main class="page" id="top">
    ${heroMarkup()}
    ${landMarkup()}
    ${dragonMarkup()}
    ${timingMarkup()}
    ${audienceMarkup()}
    ${experienceMarkup()}
    ${voicesMarkup()}
    ${guideMarkup()}
    ${warningMarkup()}
    ${bloodgoatMarkup()}
    ${resolutionMarkup()}
    ${faqMarkup()}
    ${finalMarkup()}
  </main>

  ${footerMarkup()}
  ${dockMarkup()}
`;

warnIfContactUnset();

const preloader = initPreloader();
let progress = 0;
const advance = (to: number) => {
  progress = Math.max(progress, to);
  preloader.setProgress(progress);
};
advance(0.1);

ticker.bindVisibility();
measureViewport();
initPointer();
initGrain(capabilities.reducedMotion);

let stage: Stage | null = null;
const canvas = document.getElementById('stage-canvas') as HTMLCanvasElement | null;
const fallback = document.getElementById('fallback');

if (canvas && capabilities.wantsLiveStage) {
  stage = Stage.create(canvas, capabilities.tier);
}

advance(0.45);

const narrative = new Narrative(BEATS);

function sizeStage(): void {
  if (!stage) return;
  stage.resize(window.innerWidth, window.innerHeight, pixelRatio());
}

if (stage) {
  fallback?.classList.add('is-behind');
  sizeStage();
  stage.setFrameCallback(() => {
    stage?.apply(narrative.update());
  });
} else {
  canvas?.remove();
  document.documentElement.classList.add('no-webgl');
}

initFallback(capabilities.reducedMotion);
advance(0.7);

// --- behaviour ---------------------------------------------------------------

initChrome();
initHero(capabilities.reducedMotion);
initLand(stage);
initDragon(narrative);
initTiming(narrative, capabilities.reducedMotion);
initAudience(capabilities.reducedMotion);
initExperience();
initVoices(capabilities.reducedMotion);
initGuide(capabilities.reducedMotion);
initWarning(capabilities.reducedMotion);
initBloodGoat(narrative, capabilities.reducedMotion);
initClosing(capabilities.reducedMotion);
initReveals(capabilities.reducedMotion);
initPhotoSweep(capabilities.reducedMotion);
initMagnetic();
if (capabilities.finePointer && !capabilities.reducedMotion) initCursor();
initSmoothScroll(!capabilities.reducedMotion);

window.addEventListener('scroll', readScroll, { passive: true });

let resizeTimer = 0;
window.addEventListener(
  'resize',
  () => {
    measureViewport();
    sizeStage();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => narrative.resolve(), 180);
  },
  { passive: true },
);

// Sound follows the narrative whenever the visitor has switched it on.
ticker.add(() => {
  readScroll();
  if (!soundscape.enabled) return;
  const journey = viewport.scrollY / (viewport.maxScroll || 1);
  soundscape.setMood(0, 0.2 + Math.min(journey, 1) * 0.25);
});

onMotionPreferenceChange((reduced) => {
  if (reduced) {
    stage?.stop();
    document.documentElement.classList.add('reduce-motion');
  } else {
    stage?.start();
    document.documentElement.classList.remove('reduce-motion');
  }
});

if (capabilities.reducedMotion) document.documentElement.classList.add('reduce-motion');

// --- opening -----------------------------------------------------------------

async function open(): Promise<void> {
  advance(0.85);
  try {
    await document.fonts.ready;
  } catch {
    /* fonts are an enhancement, never a gate */
  }
  measureViewport();
  narrative.resolve();
  advance(0.95);

  if (stage) {
    stage.apply(narrative.update());
    stage.start();
    // One frame in hand before the cover lifts, so the first thing seen is
    // the landscape rather than an empty canvas.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    canvas?.classList.add('is-live');
  }

  advance(1);
  await preloader.finish();
  document.body.classList.add('is-open');
  narrative.resolve();
}

preloader.onSkip(() => {
  void preloader.finish().then(() => {
    document.body.classList.add('is-open');
    narrative.resolve();
  });
});

if (document.readyState === 'complete') void open();
else window.addEventListener('load', () => void open(), { once: true });

// A late safety net: never leave a visitor looking at the cover.
window.setTimeout(() => {
  if (document.getElementById('preloader')) {
    void preloader.finish().then(() => document.body.classList.add('is-open'));
  }
}, 9000);
