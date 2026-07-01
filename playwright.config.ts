import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const CLIENT_DASHBOARD = path.resolve(__dirname, '../caiac-client-dashboard')
const OPS_DASHBOARD = path.resolve(__dirname, '../caiac-ops-dashboard')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'client-dashboard',
      testDir: './tests/e2e/client-dashboard',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CLIENT_DASHBOARD_URL ?? 'http://localhost:5173',
      },
    },
    {
      name: 'ops-dashboard',
      testDir: './tests/e2e/ops-dashboard',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.OPS_DASHBOARD_URL ?? 'http://localhost:5174',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: CLIENT_DASHBOARD,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --port 5174',
      cwd: OPS_DASHBOARD,
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
