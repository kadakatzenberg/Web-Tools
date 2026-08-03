import { ticker } from './ticker';
import { clamp, lerp } from '../gl/math';

export interface PointerState {
  /** Normalised to -1..1 across the viewport. */
  x: number;
  y: number;
  /** Eased values, used for anything that moves the camera or the fog. */
  ex: number;
  ey: number;
  active: boolean;
}

export const pointer: PointerState = { x: 0, y: 0, ex: 0, ey: 0, active: false };

export function initPointer(): void {
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      pointer.x = clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
      pointer.y = clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1);
      pointer.active = true;
    },
    { passive: true },
  );
  window.addEventListener('pointerleave', () => {
    pointer.active = false;
  });
  ticker.add((dt) => {
    const k = 1 - Math.pow(0.001, dt);
    const targetX = pointer.active ? pointer.x : 0;
    const targetY = pointer.active ? pointer.y : 0;
    pointer.ex = lerp(pointer.ex, targetX, k);
    pointer.ey = lerp(pointer.ey, targetY, k);
  });
}

/**
 * A slow ring that follows the pointer. The native cursor is left visible, so
 * this is decoration rather than a replacement.
 */
export function initCursor(): void {
  if (!matchMedia('(pointer: fine)').matches) return;
  const ring = document.createElement('div');
  ring.className = 'qi-cursor';
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(ring);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let tx = x;
  let ty = y;
  let shown = false;

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      tx = event.clientX;
      ty = event.clientY;
      if (!shown) {
        shown = true;
        ring.classList.add('is-live');
      }
    },
    { passive: true },
  );

  document.addEventListener('pointerover', (event) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest('a, button, [data-magnetic], summary');
    ring.classList.toggle('is-active', Boolean(interactive));
  });

  window.addEventListener('blur', () => ring.classList.remove('is-live'));

  ticker.add((dt) => {
    const k = 1 - Math.pow(0.0009, dt);
    x = lerp(x, tx, k);
    y = lerp(y, ty, k);
    ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });
}

/**
 * Magnetic pull on the primary calls to action. Applied to a handful of
 * elements only, and never on touch, where it would fight the tap target.
 */
export function initMagnetic(root: ParentNode = document): void {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const targets = root.querySelectorAll<HTMLElement>('[data-magnetic]');
  targets.forEach((el) => {
    let raf = 0;
    const strength = Number(el.dataset.magnetic || 0.28);

    const move = (event: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        el.style.transform = `translate3d(${dx * strength}px, ${dy * strength * 0.6}px, 0)`;
      });
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };

    el.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      el.style.transition = 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)';
      window.setTimeout(() => {
        el.style.transition = 'transform 120ms linear';
      }, 260);
      move(event);
    });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform 520ms cubic-bezier(0.16, 1, 0.3, 1)';
      reset();
    });
    el.addEventListener('blur', reset);
  });
}
