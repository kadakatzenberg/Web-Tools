/**
 * Builds the Open Graph card at public/media/social-card.jpg.
 *
 * It composes from a plate that already ships in public/media, so it runs
 * standalone: no dev server, no browser, no capture cache. Run it after
 * `npm run plates` whenever the artwork or the wording changes.
 */
import sharp from 'sharp';
import { existsSync, statSync } from 'node:fs';
import { DRAGON_PATH } from './dragon-path.mjs';

const media = new URL('../public/media/', import.meta.url).pathname;
const WIDTH = 1200;
const HEIGHT = 630;

// The card is built from the widest ridge plate, which reads at card size.
const source = `${media}ridge-study-1600.webp`;
if (!existsSync(source)) {
  console.error(
    `Missing ${source}.\nRun \`npm run dev\` in one terminal and \`npm run plates\` in another first.`,
  );
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TITLE = 'WALK THE DRAGON';
const LEDE = "Joey Yap's China Excursion";
const DATES = '10 to 15 September 2026';
const STATUS = 'RESERVATIONS NOW OPEN';

/**
 * Type is drawn as SVG over the plate. Letter spacing is set per element
 * rather than per character so the words stay whole at any render size.
 */
const overlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#06070A" stop-opacity="0.94"/>
      <stop offset="52%"  stop-color="#06070A" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#06070A" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%"   stop-color="#06070A" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#06070A" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>
  <rect y="${HEIGHT - 220}" width="${WIDTH}" height="220" fill="url(#floor)"/>

  <!-- The 龍 outline, the same glyph the page uses as its anchor. -->
  <g transform="translate(830 150) scale(0.34) translate(0 935) scale(1 -1)"
     fill="#C9A24A" opacity="0.20">
    <path d="${DRAGON_PATH}"/>
  </g>

  <g font-family="Liberation Serif, DejaVu Serif, serif" fill="#F4F1EA">
    <text x="82" y="238" font-size="76" letter-spacing="6.5" font-weight="700">${esc(TITLE)}</text>
    <text x="86" y="300" font-size="31" letter-spacing="1.2" fill="#C8CCD2" font-style="italic">${esc(LEDE)}</text>
  </g>

  <rect x="86" y="344" width="118" height="2" fill="#C9A24A"/>

  <g font-family="DejaVu Sans Mono, Liberation Mono, monospace">
    <text x="86" y="398" font-size="25" letter-spacing="3.4" fill="#E6E2D8">${esc(DATES)}</text>
    <text x="86" y="452" font-size="17" letter-spacing="4.6" fill="#C9A24A">${esc(STATUS)}</text>
  </g>
</svg>`);

await sharp(source)
  .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
  .modulate({ saturation: 0.8, brightness: 1.04 })
  .composite([{ input: overlay, top: 0, left: 0 }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(`${media}social-card.jpg`);

const { size } = statSync(`${media}social-card.jpg`);
console.log(`wrote social-card.jpg (${WIDTH}x${HEIGHT}, ${(size / 1024).toFixed(0)} kB)`);
