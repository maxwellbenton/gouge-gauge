import { defineConfig, devices } from '@playwright/test'

// Fake-camera flags below only work on Chromium, so e2e is Chromium-only for
// now. See e2e/README.md for how the barcode video fixture was made and why.
const fixturePath = new URL('./e2e/fixtures/barcode.y4m', import.meta.url).pathname

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // Default (30s) is tight for these tests: each one launches a real
  // Chromium + fake camera device, and several run as separate workers in
  // parallel (see e2e/README.md on why real-photos/ needs one file per
  // fixture) — real camera negotiation plus the dynamic zxing import under
  // that kind of parallel load can genuinely take a while, independent of
  // any app-level bug.
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${fixturePath}`,
          ],
        },
      },
    },
  ],
})
