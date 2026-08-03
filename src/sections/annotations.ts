import type { Stage } from '../gl/stage';
import type { Vec3 } from '../gl/math';
import { ticker } from '../core/ticker';
import { clamp01 } from '../gl/math';

export interface Annotation {
  label: string;
  reading: string;
  world: Vec3;
}

/**
 * Field notes pinned to the terrain itself. Each label is projected through the
 * live camera every frame, so it stays on the feature it names as the camera
 * moves rather than sitting in a fixed spot on the screen.
 */
export function annotationsMarkup(id: string, items: Annotation[]): string {
  const nodes = items
    .map(
      (item, index) => `
      <li class="annotation" data-index="${index}">
        <span class="annotation__dot" aria-hidden="true"></span>
        <span class="annotation__rule" aria-hidden="true"></span>
        <span class="annotation__text">
          <span class="annotation__label">${item.label}</span>
          <span class="annotation__reading">${item.reading}</span>
        </span>
      </li>`,
    )
    .join('');
  return `<ul class="annotations" id="${id}" aria-hidden="true">${nodes}</ul>`;
}

export function initAnnotations(
  id: string,
  items: Annotation[],
  stage: Stage | null,
  isActive: () => number,
): void {
  const root = document.getElementById(id);
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.annotation'));

  if (!stage) {
    // Without the live landscape the notes fall back to a static arrangement
    // read from CSS, so the section still carries its observations.
    root.classList.add('annotations--static');
    return;
  }

  const out = { x: 0, y: 0, depth: 0 };
  ticker.add(() => {
    const active = isActive();
    root.style.opacity = String(active);
    if (active <= 0.001) {
      root.style.visibility = 'hidden';
      return;
    }
    root.style.visibility = 'visible';

    nodes.forEach((node, index) => {
      const item = items[index];
      if (!item) return;
      const visible = stage.project(item.world, out);
      const inFrame =
        visible &&
        out.x > -60 &&
        out.x < window.innerWidth + 60 &&
        out.y > 40 &&
        out.y < window.innerHeight - 40;
      if (!inFrame) {
        node.style.opacity = '0';
        return;
      }
      const stagger = clamp01((active - index * 0.12) * 3);
      node.style.opacity = String(stagger * clamp01((360 - out.depth) / 180));
      node.style.transform = `translate3d(${out.x.toFixed(1)}px, ${out.y.toFixed(1)}px, 0)`;
    });
  });
}
