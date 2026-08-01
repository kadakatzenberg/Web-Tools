import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the production build through `vite preview`, not
 * the dev server, so what is verified is what actually ships — including the
 * code-split chunks, the minified CSS and the real worker bundle.
 *
 * Every test intercepts Supabase and serves a fixture. Nothing here touches
 * the live archive: the suite must be deterministic, must run offline, and
 * must never be one typo away from writing to a database 304 people depend on.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium',
      // SwiftShader, so the WebGL star map runs in a headless container.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
