/**
 * Screenshot capture only — not part of the test suite.
 *
 *   npx playwright test --config=playwright.capture.config.ts --project=desktop-1440
 */
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, testDir: './tools' });
