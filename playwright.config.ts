import { defineConfig, devices } from '@playwright/test'

// Browser smoke tests against the production build. Uses the installed Google
// Chrome (no browser download). Run: npm run e2e
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4175/genograph-app/',
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175/genograph-app/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
