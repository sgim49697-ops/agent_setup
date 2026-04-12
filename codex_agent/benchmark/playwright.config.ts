// playwright.config.ts - 공유 Playwright 설정 (각 하네스 앱을 평가)
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL
const PLAYWRIGHT_EXTRA_ARGS = process.env.PLAYWRIGHT_EXTRA_ARGS?.split(' ').filter(Boolean) ?? []

export default defineConfig({
  testDir: './playwright',
  outputDir: './playwright/test-results',
  timeout: 30_000,
  retries: 0,
  reporter: [
    ['json', { outputFile: './playwright/smoke-results.json' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'off',
    ...(PLAYWRIGHT_CHANNEL ? { channel: PLAYWRIGHT_CHANNEL } : {}),
    ...(PLAYWRIGHT_EXTRA_ARGS.length > 0
      ? {
          launchOptions: {
            args: PLAYWRIGHT_EXTRA_ARGS,
          },
        }
      : {}),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1200 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
})
