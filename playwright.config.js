import { defineConfig, devices } from '@playwright/test'

// Mobile-responsive test harness. Boots `npm run dev`, then hits each key view
// at phone/tablet viewports and asserts that the page does not overflow the
// viewport horizontally.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'iphone-se',
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', browserName: 'chromium' }
    },
    {
      name: 'iphone-12',
      use: { ...devices['iPhone 12'], defaultBrowserType: 'chromium', browserName: 'chromium' }
    },
    {
      name: 'ipad-portrait',
      use: {
        ...devices['iPad (gen 7)'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 }
      }
    }
  ],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
