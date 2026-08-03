/**
 * Grades the captured frames and writes the responsive AVIF and WebP sets used
 * by the page. Grain and a duotone lift are applied here rather than in CSS so
 * the plates carry the same film as the live landscape.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { PLATES } from './plates.config.mjs';

const raw = new URL('../scripts/.cache/raw', import.meta.url).pathname;
const out = new URL('../public/media', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const WIDTHS = [640, 1024, 1600];

const GRADES = {
  study: { saturation: 0.62, brightness: 1.06, tint: [10, 14, 22], grain: 9 },
  chapter: { saturation: 0.7, brightness: 1.04, tint: [12, 12, 18], grain: 8 },
  scale: { saturation: 0.55, brightness: 1.0, tint: [10, 13, 20], grain: 10 },
  social: { saturation: 0.82, brightness: 1.12, tint: [14, 12, 16], grain: 6 },
};

/** A tile of monochrome noise, blended over the plate as film grain. */
async function grainTile(width, height, strength) {
  const size = width * height * 3;
  const data = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i += 3) {
    const v = 128 + (Math.random() - 0.5) * strength * 2;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

for (const plate of PLATES) {
  const grade = GRADES[plate.grade] ?? GRADES.chapter;
  const source = `${raw}/${plate.name}.png`;
  const meta = await sharp(source).metadata();

  const graded = await sharp(source)
    .modulate({ saturation: grade.saturation, brightness: grade.brightness })
    .linear(1.1, -10)
    .composite([
      {
        input: await grainTile(meta.width, meta.height, grade.grain),
        blend: 'overlay',
      },
      {
        // A cool mineral wash in the shadows, matching the opening palette.
        input: {
          create: {
            width: meta.width,
            height: meta.height,
            channels: 4,
            background: { r: grade.tint[0], g: grade.tint[1], b: grade.tint[2], alpha: 0.16 },
          },
        },
        blend: 'soft-light',
      },
    ])
    .toBuffer();

  if (plate.name === 'social-card') {
    await sharp(graded)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(`${out}/social-card.jpg`);
    console.log('wrote social-card.jpg');
    continue;
  }

  for (const width of WIDTHS) {
    // Every plate ships all three widths so the srcset never points at a file
    // that was skipped for being wider than the capture.
    const resized = sharp(graded).resize(width, null, { withoutEnlargement: false });
    await resized.clone().avif({ quality: 52, effort: 5 }).toFile(`${out}/${plate.name}-${width}.avif`);
    await resized.clone().webp({ quality: 74, effort: 5 }).toFile(`${out}/${plate.name}-${width}.webp`);
  }
  console.log(`wrote ${plate.name} at ${WIDTHS.join(', ')}`);
}

// The favicon set is derived from the same palette as the page chrome.
await sharp({
  create: { width: 180, height: 180, channels: 4, background: { r: 6, g: 7, b: 10, alpha: 1 } },
})
  .composite([
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 1000 1000">
           <g transform="translate(0 935) scale(1 -1)" fill="#C9A24A">
             <path d="${(await import('./dragon-path.mjs')).DRAGON_PATH}" />
           </g>
         </svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toFile(new URL('../public/apple-touch-icon.png', import.meta.url).pathname);
console.log('wrote apple-touch-icon.png');

rmSync(raw, { recursive: true, force: true });
console.log(`media directory now holds ${readdirSync(out).length} files`);
