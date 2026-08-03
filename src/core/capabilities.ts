import type { QualityTier } from '../gl/stage';

export interface Capabilities {
  reducedMotion: boolean;
  finePointer: boolean;
  touch: boolean;
  tier: QualityTier['name'];
  /** True when the live landscape should be attempted at all. */
  wantsLiveStage: boolean;
}

const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function guessTier(): QualityTier['name'] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const coarse = matchMedia('(pointer: coarse)').matches;

  if (memory <= 2 || cores <= 2) return 'low';
  if (coarse && narrow) return memory >= 6 && cores >= 6 ? 'medium' : 'low';
  if (cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

export function detectCapabilities(): Capabilities {
  const reducedMotion = motionQuery?.matches ?? false;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  return {
    reducedMotion,
    finePointer,
    touch,
    tier: guessTier(),
    wantsLiveStage: !reducedMotion,
  };
}

export function onMotionPreferenceChange(handler: (reduced: boolean) => void): void {
  motionQuery?.addEventListener('change', (event) => handler(event.matches));
}

/** Device pixel ratio, kept sane on high density displays. */
export function pixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}
