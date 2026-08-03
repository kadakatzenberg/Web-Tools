/**
 * Turns raw photographs in `public/photos/` into the art-directed, graded,
 * responsive sets the page uses.
 *
 * For each role declared in src/content/photos.ts it produces every requested
 * crop at every width, in AVIF and WebP, colour graded to the page palette with
 * film grain laid in. Roles with no source file are skipped and the page falls
 * back to its procedural plate, so this can be run at any point in the shoot
 * clearance process.
 *
 *   npm run photos
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, extname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = join(root, 'public/photos');
const outDir = join(root, 'public/media/photos');
const manifestPath = join(root, 'src/content/photo-manifest.json');

mkdirSync(sourceDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

/* Read the role table straight out of the TypeScript source. Keeping one
   declaration means the page and this script can never disagree. */
const rolesSource = readFileSync(join(root, 'src/content/photos.ts'), 'utf8');
const rolesLiteral = rolesSource.slice(
  rolesSource.indexOf('export const PHOTO_ROLES'),
  rolesSource.indexOf('const available'),
);
const ROLES = new Function(
  `${rolesLiteral.replace('export const PHOTO_ROLES: PhotoRole[] =', 'const roles =')}; return roles;`,
)();

const WIDTHS = [640, 1024, 1600];

const GRADES = {
  // Cool and close to neutral, matching the opening palette.
  mineral: { saturation: 0.66, brightness: 1.04, tint: { r: 12, g: 16, b: 26 }, tintAlpha: 0.2, grain: 9 },
  // A little warmth held back, for the moments with light in them.
  warm: { saturation: 0.78, brightness: 1.06, tint: { r: 30, g: 20, b: 10 }, tintAlpha: 0.16, grain: 8 },
  // Drained, for the contaminated passage.
  ash: { saturation: 0.3, brightness: 0.98, tint: { r: 24, g: 12, b: 10 }, tintAlpha: 0.24, grain: 11 },
  none: null,
};

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

function findSource(file) {
  const direct = join(sourceDir, file);
  if (existsSync(direct)) return direct;
  // Accept any extension for the same stem, so a .jpeg or .png still lands.
  const stem = basename(file, extname(file));
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']) {
    const candidate = join(sourceDir, stem + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const found = [];
const missing = [];

for (const role of ROLES) {
  const source = findSource(role.file);
  if (!source) {
    missing.push(role.id);
    continue;
  }

  const keepsAlpha = role.treatment === 'cutout';
  const grade = GRADES[role.grade];
  const meta = await sharp(source).metadata();

  for (const crop of role.crops) {
    // Work at the largest useful size, then step down.
    const targetW = Math.min(meta.width, 2000);
    const targetH = Math.round(targetW / crop.ratio);

    let pipeline = sharp(source, { failOn: 'none' });

    if (keepsAlpha) {
      // A cutout keeps its transparency and its framing; it is composited into
      // the landscape rather than cropped into a rectangle.
      pipeline = pipeline.resize(targetW, null, { withoutEnlargement: true });
    } else {
      pipeline = pipeline.resize(targetW, targetH, {
        fit: 'cover',
        position: crop.focus === 'attention' ? sharp.strategy.attention : crop.focus,
      });
    }

    let buffer = await pipeline.toBuffer();

    if (grade) {
      const size = await sharp(buffer).metadata();
      const layers = [
        { input: await grainTile(size.width, size.height, grade.grain), blend: 'overlay' },
        {
          input: {
            create: {
              width: size.width,
              height: size.height,
              channels: 4,
              background: { ...grade.tint, alpha: grade.tintAlpha },
            },
          },
          blend: 'soft-light',
        },
      ];
      buffer = await sharp(buffer)
        .modulate({ saturation: grade.saturation, brightness: grade.brightness })
        .linear(1.08, -8)
        .composite(layers)
        .toBuffer();
    }

    for (const width of WIDTHS) {
      const resized = sharp(buffer).resize(width, null, { withoutEnlargement: false });
      const stem = `${outDir}/${role.id}-${crop.name}-${width}`;
      await resized
        .clone()
        .avif({ quality: keepsAlpha ? 60 : 54, effort: 5 })
        .toFile(`${stem}.avif`);
      await resized
        .clone()
        .webp({ quality: keepsAlpha ? 82 : 76, effort: 5, alphaQuality: 90 })
        .toFile(`${stem}.webp`);
    }
    console.log(`  ${role.id}/${crop.name} at ${WIDTHS.join(', ')}`);
  }
  found.push(role.id);
}

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      roles: found,
      generated: new Date().toISOString().slice(0, 10),
      note: 'Rewritten by `npm run photos`. Lists the photograph roles that have processed files in public/media/photos.',
    },
    null,
    2,
  )}\n`,
);

if (found.length === 0) {
  // Leave nothing behind that the page might reference.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

console.log(`\nprocessed ${found.length} role(s): ${found.join(', ') || 'none'}`);
if (missing.length) {
  console.log(`awaiting source files for: ${missing.join(', ')}`);
  console.log(`drop them into public/photos/ and run this again`);
}
