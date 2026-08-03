/** Grabs one frame of the landscape from the capture page. */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://127.0.0.1:5173/capture.html';
const out = process.env.OUT ?? '/tmp/frames';
const width = Number(process.env.W ?? 1440);
const height = Number(process.env.H ?? 900);
const query = process.env.Q ?? '';
const name = process.env.NAME ?? 'frame';

mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}?w=${width}&h=${height}&dpr=1&${query}`, { waitUntil: 'load' });
await page.waitForSelector('#capture-ready', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/${name}.png` });
await browser.close();
console.log(`${out}/${name}.png`);
