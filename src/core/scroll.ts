import Lenis from 'lenis';
import { ticker } from './ticker';
import { clamp01 } from '../gl/math';

let lenis: Lenis | null = null;

/**
 * Smooth scrolling is an enhancement only. Wheel, keyboard, scrollbar, anchor
 * links and the back button all keep their native behaviour, and the whole
 * thing is skipped when the visitor has asked for reduced motion.
 */
export function initSmoothScroll(enabled: boolean): void {
  if (!enabled || lenis) return;
  lenis = new Lenis({
    duration: 1.05,
    easing: (t: number) => 1 - Math.pow(1 - t, 3),
    lerp: 0.11,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    syncTouch: false,
    autoResize: true,
  });
  ticker.add((_dt, now) => lenis?.raf(now));
}

export function stopSmoothScroll(): void {
  lenis?.destroy();
  lenis = null;
}

export function scrollTo(target: string | HTMLElement, offset = 0): void {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.2 });
    return;
  }
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export interface Viewport {
  scrollY: number;
  height: number;
  width: number;
  maxScroll: number;
}

export const viewport: Viewport = {
  scrollY: 0,
  height: 1,
  width: 1,
  maxScroll: 1,
};

export function measureViewport(): void {
  viewport.height = window.innerHeight;
  viewport.width = window.innerWidth;
  viewport.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  viewport.scrollY = window.scrollY;
}

export function readScroll(): void {
  viewport.scrollY = window.scrollY;
}

/**
 * How far an element has travelled through the viewport.
 * 0 when its top edge reaches the bottom of the screen, 1 when its bottom edge
 * leaves the top.
 */
export function elementProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const total = rect.height + viewport.height;
  return clamp01((viewport.height - rect.top) / (total || 1));
}

/** Progress across a sticky passage: 0 when it pins, 1 when it releases. */
export function stickyProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const travel = rect.height - viewport.height;
  if (travel <= 0) return clamp01((viewport.height * 0.5 - rect.top) / (rect.height || 1));
  return clamp01(-rect.top / travel);
}
