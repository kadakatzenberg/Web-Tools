/**
 * Captures the still plates used across the page from the same shader the live
 * landscape runs, so the imagery and the moving background are one piece of art
 * rather than two. Run against the dev server: `npm run dev` then `npm run plates`.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { PLATES } from './plates.config.mjs';

const base = process.env.BASE ?? 'http://127.0.0.1:5173/capture.html';
const raw = new URL('../scripts/.cache/raw', import.meta.url).pathname;
mkdirSync(raw, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

for (const plate of PLATES) {
  const width = plate.width ?? 1400;
  const height = plate.height ?? 1050;
  const started = Date.now();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`  ! ${plate.name}: ${e.message}`));
  const query = new URLSearchParams({
    w: String(width),
    h: String(height),
    dpr: '1',
    scale: '0.85',
    frames: '2',
    ...plate.params,
  });
  await page.goto(`${base}?${query}`, { waitUntil: 'load' });
  await page.waitForSelector('#capture-ready', { state: 'attached', timeout: 300000 });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${raw}/${plate.name}.png` });
  await page.close();
  console.log(`captured ${plate.name} (${width}x${height}) in ${Date.now() - started}ms`);
}

await browser.close();
