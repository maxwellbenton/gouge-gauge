import { test, expect } from '@playwright/test'
import type { RealProductFixture } from '../fixtures/real-products.js'
import { addNewStoreInline } from '../helpers.js'

// Shared test bodies for the real-photo fixtures. Split into per-fixture
// spec files (dog-treat.spec.ts etc.) rather than one file with a loop,
// because Playwright requires `test.use({ launchOptions })` to be top-level
// in a file — it can't live inside a `test.describe` block, since changing
// it forces a new worker/browser process. Each fixture needs a different
// fake-camera video, so each fixture needs its own file. See
// e2e/README.md for the full explanation.

export function runDecodableFixtureTest(fixture: RealProductFixture) {
  test(`camera decodes ${fixture.id} and the price entry persists`, async ({ page }) => {
    await page.goto('/')

    // Real decode of a real (imperfect — off-angle, cluttered background)
    // phone photo through the app's actual ZXing pipeline, not a mock.
    await expect(page.getByLabel('Product name')).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Product name').fill(fixture.productName)
    await page.getByRole('button', { name: 'Continue' }).click()

    await addNewStoreInline(page, 'Test Store')
    await page.getByLabel('Price').fill('9.99')
    await page.getByRole('button', { name: 'Save price' }).click()

    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()
    await expect(page.getByText(`${fixture.productName} — $9.99 at Test Store`)).toBeVisible()

    // Confirm persistence from a different screen rather than "Scan
    // another", which would remount the camera and immediately redetect
    // this same fixture's barcode.
    await page.getByRole('link', { name: 'Stores' }).click()
    await expect(page.getByText('Test Store')).toBeVisible()
    await expect(page.getByText('1 price logged')).toBeVisible()
  })
}

export function runUndecodableFixtureTest(fixture: RealProductFixture) {
  test(`camera does not falsely detect anything from the out-of-focus ${fixture.id} photo, and manual entry still works`, async ({
    page,
  }) => {
    await page.goto('/')

    // Real negative-result wait, not a sleep papering over a bug: this
    // fixture was independently confirmed non-decodable (see
    // e2e/fixtures/real-products.ts, and the extended debugging attempts
    // noted in e2e/README.md) before being used here. The app should still
    // be sitting on the scanning screen after giving the camera a real
    // window to try.
    await page.waitForTimeout(5_000)
    await expect(page.getByLabel('Product name')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Enter barcode manually' })).toBeVisible()

    await page.getByRole('button', { name: 'Enter barcode manually' }).click()
    await page.getByLabel('Barcode number').fill(fixture.barcode)
    await page.getByRole('button', { name: 'Look up price' }).click()

    await expect(page.getByLabel('Product name')).toBeVisible()
    await page.getByLabel('Product name').fill(fixture.productName)
    await page.getByRole('button', { name: 'Continue' }).click()

    await addNewStoreInline(page, 'Test Store')
    await page.getByLabel('Price').fill('4.50')
    await page.getByRole('button', { name: 'Save price' }).click()

    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()
    await expect(page.getByText(`${fixture.productName} — $4.50 at Test Store`)).toBeVisible()
  })
}

export function fakeCameraLaunchArgs(videoPath: string): string[] {
  return [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${videoPath}`,
  ]
}
