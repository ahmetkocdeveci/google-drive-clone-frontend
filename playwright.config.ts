import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4179'
const apiOrigin = process.env.E2E_API_ORIGIN || 'http://127.0.0.1:4100'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure', video: 'off' },
  projects: [
    { name: 'chromium', testIgnore: '**/mobile.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', testMatch: '**/mobile.spec.ts', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: process.env.E2E_EXTERNAL_SERVER === '1' ? undefined : {
    command: 'pnpm dev', url: `${baseURL}/login`, timeout: 120_000, reuseExistingServer: !process.env.CI,
    env: { NUXT_PUBLIC_DATA_MODE: 'http', NUXT_PUBLIC_API_BASE: `${apiOrigin}/api/v1` },
  },
})
