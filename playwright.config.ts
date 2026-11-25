import { defineConfig } from '@playwright/test';

const runtimeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const isCI = Boolean(runtimeEnv.CI);
const port = Number(runtimeEnv.STARLIGHT_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'redteam/**/*.spec.ts'],
  retries: isCI ? 1 : 0,
  timeout: isCI ? 120_000 : 75_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: isCI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}/starlight_v2/`,
    browserName: 'chromium',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'node tests/redteam/subpath-server.mjs',
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/starlight_v2/`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
