import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const CLIENT_DASHBOARD = path.resolve(__dirname, '../caiac-client-dashboard')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'client-dashboard / chromium',
      testDir: './tests/e2e/client-dashboard',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    cwd: CLIENT_DASHBOARD,
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
