/** Development helper: renders every camera beat into one contact sheet. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const src = readFileSync(new URL('../src/core/beats.ts', import.meta.url), 'utf8')
  .replace(/import type \{ Beat \} from '\.\/narrative';/, '')
  .replace(/export const BEATS: Beat\[\] =/, 'export const BEATS =');
const tmp = new URL('../scripts/.cache/beats.mjs', import.meta.url);
mkdirSync(new URL('../scripts/.cache/', import.meta.url).pathname, { recursive: true });
writeFileSync(tmp, src);
const { BEATS } = await import(tmp.href);

const W = 640;
const H = 400;
const out = new URL('../scripts/.cache/sheet', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

const tiles = [];
let previous = {};
for (const [index, beat] of BEATS.entries()) {
  const state = { ...previous, ...beat.state };
  previous = state;
  const params = new URLSearchParams({ w: String(W), h: String(H), dpr: '1', scale: '0.8', frames: '2' });
  for (const [key, value] of Object.entries(state)) {
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  params.set('pos', state.camPos.join(','));
  params.set('target', state.camTarget.join(','));
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:5173/capture.html?${params}`, { waitUntil: 'load' });
  await page.waitForSelector('#capture-ready', { state: 'attached', timeout: 180000 });
  const file = `${out}/${String(index).padStart(2, '0')}-${beat.id}.png`;
  await page.screenshot({ path: file });
  await page.close();
  tiles.push({ file, label: `${index} ${beat.id}@${beat.at}` });
  console.log(`beat ${index} ${beat.id}`);
}
await browser.close();

const cols = 3;
const rows = Math.ceil(tiles.length / cols);
const composite = tiles.map((tile, i) => ({
  input: tile.file,
  left: (i % cols) * W,
  top: Math.floor(i / cols) * H,
}));
await sharp({
  create: { width: cols * W, height: rows * H, channels: 3, background: '#000' },
})
  .composite(composite)
  .jpeg({ quality: 80 })
  .toFile(`${out}/sheet.jpg`);
console.log(`${out}/sheet.jpg`);
console.log(tiles.map((t, i) => `${i}: ${t.label}`).join('\n'));
