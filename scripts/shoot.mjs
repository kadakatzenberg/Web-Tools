/**
 * Development helper: drives the page in a real browser, captures frames at a
 * set of scroll positions and reports console errors. Not part of the build.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.env.URL ?? 'http://127.0.0.1:5173/';
const outDir = process.env.OUT ?? '/tmp/shots';
const width = Number(process.env.W ?? 1440);
const height = Number(process.env.H ?? 900);
const positions = (process.env.POS ?? '0,0.06,0.14,0.22,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1')
  .split(',')
  .map(Number);
const tag = process.env.TAG ?? `${width}x${height}`;
const reduced = process.env.REDUCED === '1';
const noWebgl = process.env.NOWEBGL === '1';

mkdirSync(outDir, { recursive: true });

const args = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
if (noWebgl) args.push('--disable-gpu', '--disable-webgl', '--disable-webgl2');

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args,
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
  hasTouch: width < 900,
  isMobile: width < 900,
});
const page = await context.newPage();

const messages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    messages.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => messages.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) =>
  messages.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`),
);
const badResponses = [];
page.on('response', (res) => {
  if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('preloader'), null, { timeout: 20000 })
  .catch(() => messages.push('[warn] preloader still present after 20s'));
await page.waitForTimeout(1200);

const overflow = [];
for (const pos of positions) {
  await page.evaluate((p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * p, behavior: 'instant' });
  }, pos);
  await page.waitForTimeout(900);
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (doc.scrollW > doc.clientW + 1) {
    overflow.push(`${pos}: scrollWidth ${doc.scrollW} > clientWidth ${doc.clientW}`);
  }
  await page.screenshot({ path: `${outDir}/${tag}-${String(pos).replace('.', '_')}.png` });
}

console.log('=== console ===');
console.log(messages.length ? [...new Set(messages)].join('\n') : 'clean');
console.log('=== bad responses ===');
console.log(badResponses.length ? [...new Set(badResponses)].join('\n') : 'none');
console.log('=== horizontal overflow ===');
console.log(overflow.length ? overflow.join('\n') : 'none');

await browser.close();
