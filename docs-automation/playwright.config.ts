import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.DOCS_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: path.join(__dirname, 'stories'),
  testMatch: '**/*.guide.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  outputDir: path.join(__dirname, '.output'),
});
