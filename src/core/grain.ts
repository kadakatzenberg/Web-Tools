import { ticker } from './ticker';

/**
 * A single tile of monochrome noise, generated once and stepped a few times a
 * second. It sits over the whole page so type and landscape share one film.
 */
export function initGrain(reducedMotion: boolean): void {
  const layer = document.querySelector<HTMLElement>('.grain');
  if (!layer) return;

  const size = 180;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  layer.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;

  if (reducedMotion) return;

  let elapsed = 0;
  ticker.add((dt) => {
    elapsed += dt;
    if (elapsed < 1 / 12) return;
    elapsed = 0;
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  });
}
