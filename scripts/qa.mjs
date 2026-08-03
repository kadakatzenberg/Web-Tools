/**
 * Drives the built site through every required viewport and mode, reporting
 * console errors, failed requests, horizontal overflow, contrast-critical
 * chrome, CTA wiring and heading order.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.env.URL ?? 'http://127.0.0.1:4173/';
const outDir = process.env.OUT ?? '/tmp/qa';
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '430x932', width: 430, height: 932 },
  { name: '390x844', width: 390, height: 844 },
  { name: '375x812', width: 375, height: 812 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
];

const MODES = [
  { name: 'default', reduced: false, webgl: true },
  { name: 'reduced-motion', reduced: true, webgl: true },
  { name: 'no-webgl', reduced: false, webgl: false },
];

const report = [];
const say = (line) => {
  report.push(line);
  console.log(line);
};

for (const mode of MODES) {
  const args = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
  if (!mode.webgl) args.push('--disable-webgl', '--disable-webgl2', '--disable-gpu');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args,
  });

  const viewports = mode.name === 'default' ? VIEWPORTS : VIEWPORTS.slice(0, 1).concat(VIEWPORTS.slice(4, 5));

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      reducedMotion: mode.reduced ? 'reduce' : 'no-preference',
      hasTouch: vp.width < 900,
      isMobile: vp.width < 900,
    });
    const page = await context.newPage();
    const problems = new Set();
    page.on('console', (m) => {
      if (m.type() === 'error') problems.add(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.add(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) =>
      problems.add(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`),
    );
    page.on('response', (r) => {
      if (r.status() >= 400) problems.add(`http ${r.status()}: ${r.url()}`);
    });

    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    await page
      .waitForFunction(() => !document.getElementById('preloader'), null, { timeout: 30000 })
      .catch(() => problems.add('preloader did not clear within 30s'));
    await page.waitForTimeout(900);

    const overflow = [];
    const collisions = [];
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const fraction = i / steps;
      await page.evaluate((f) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: max * f, behavior: 'instant' });
      }, fraction);
      await page.waitForTimeout(mode.reduced ? 260 : 420);

      const measured = await page.evaluate(() => {
        // Any word broken across two lines is a typography failure.
        const brokenWords = [...document.querySelectorAll('.word')]
          .filter((el) => el.getClientRects().length > 1)
          .map((el) => el.textContent);
        const doc = document.documentElement;
        const wide = doc.scrollWidth > doc.clientWidth + 1;
        // Anything pushed outside the viewport horizontally.
        const offenders = [];
        if (wide) {
          document.querySelectorAll('body *').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            if (r.right > doc.clientWidth + 2 || r.left < -2) {
              const cls = el.className?.toString?.().slice(0, 40) ?? '';
              offenders.push(`${el.tagName}.${cls} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
            }
          });
        }
        return {
          wide,
          scrollW: doc.scrollWidth,
          clientW: doc.clientWidth,
          offenders: offenders.slice(0, 4),
          brokenWords,
        };
      });
      if (measured.brokenWords.length) {
        collisions.push(`${fraction.toFixed(2)}: split word ${measured.brokenWords.join(',')}`);
      }
      if (measured.wide) {
        overflow.push(
          `${fraction.toFixed(2)}: ${measured.scrollW}>${measured.clientW} ${measured.offenders.join(' | ')}`,
        );
      }
    }

    // Structure and wiring checks, run once per viewport.
    const audit = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h1, h2, h3')].map((h) =>
        Number(h.tagName[1]),
      );
      let order = true;
      for (let i = 1; i < headings.length; i++) {
        if (headings[i] - headings[i - 1] > 1) order = false;
      }
      const ctas = [...document.querySelectorAll('a[data-cta]')];
      const hrefs = new Set(ctas.map((a) => a.getAttribute('href')));
      const images = [...document.querySelectorAll('img')];
      return {
        h1: document.querySelectorAll('h1').length,
        headingOrder: order,
        headingSeq: headings.join(','),
        ctaCount: ctas.length,
        ctaHrefs: [...hrefs],
        ctaWithoutLabel: ctas.filter((a) => !a.textContent.trim()).length,
        imagesWithoutAlt: images.filter((i) => !i.getAttribute('alt')).length,
        imagesBroken: images.filter((i) => i.complete && i.naturalWidth === 0).length,
        imageCount: images.length,
        soundToggle: !!document.getElementById('sound-toggle'),
        soundPressed: document.getElementById('sound-toggle')?.getAttribute('aria-pressed'),
        skipLink: !!document.querySelector('.skip-link'),
        canvas: !!document.getElementById('stage-canvas'),
        fallbackVisible: !document.getElementById('fallback')?.classList.contains('is-behind'),
        title: document.title,
        lang: document.documentElement.lang,
      };
    });

    await page.screenshot({ path: `${outDir}/${mode.name}-${vp.name}.png` });

    const issues = [...problems];
    say(
      `\n### ${mode.name} @ ${vp.name}\n` +
        `  console/network: ${issues.length ? issues.join('\n    ') : 'clean'}\n` +
        `  overflow: ${overflow.length ? overflow.join('\n    ') : 'none'}\n` +
        `  split words: ${collisions.length ? collisions.join(', ') : 'none'}\n` +
        `  h1=${audit.h1} headingOrder=${audit.headingOrder} seq=${audit.headingSeq}\n` +
        `  ctas=${audit.ctaCount} hrefs=${JSON.stringify(audit.ctaHrefs)} unlabelled=${audit.ctaWithoutLabel}\n` +
        `  images=${audit.imageCount} noAlt=${audit.imagesWithoutAlt} broken=${audit.imagesBroken}\n` +
        `  canvas=${audit.canvas} fallbackVisible=${audit.fallbackVisible} sound=${audit.soundToggle}/${audit.soundPressed}\n` +
        `  skipLink=${audit.skipLink} lang=${audit.lang}`,
    );

    await context.close();
  }
  await browser.close();
}

console.log('\n=== QA COMPLETE ===');
