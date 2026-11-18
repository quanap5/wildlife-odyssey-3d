import { defineConfig } from '@playwright/test';

/**
 * Browser tests run against the production build (`vite preview`) in the
 * system Chrome. WebGL is rendered in software (SwiftShader) so the suite
 * works on machines without a GPU; frame rates there are far below a real GPU.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list', { printSteps: true }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 960, height: 540 },
    channel: 'chrome',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    },
    actionTimeout: 90_000,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
