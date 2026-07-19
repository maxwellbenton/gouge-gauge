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
  // Separate from the per-test timeout above: this is the default budget
  // each individual `expect(...).toBeVisible()` etc. gets (Playwright's own
  // default is 5s). Confirmed too tight here — a full local run (8 workers,
  // each a real Chromium + camera pipeline) showed every post-save
  // assertion failing at exactly "Timeout: 5000ms" while the surrounding
  // test still had 35+s of its overall budget left, i.e. the app was
  // working, just slower than 5s to re-render under that much parallel CPU
  // contention. Bumping the per-test timeout earlier didn't touch this
  // separate, shorter default — that was the actual gap.
  expect: {
    timeout: 10_000,
  },
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
