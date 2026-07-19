import { test, expect } from '@playwright/test'
import { addNewStoreInline } from './helpers.js'

// The barcode encoded in e2e/fixtures/barcode.y4m. ZXing reports EAN-13 codes
// that start with 0 as UPC-A with the leading zero stripped — see
// e2e/README.md for how this fixture was generated and verified standalone
// before wiring it into these tests.
const FIXTURE_BARCODE = '040232013409'

// NOTE on the fake camera: the video fixture is wired up once, globally, in
// playwright.config.ts (Chromium's --use-file-for-fake-video-capture), so
// the Scan page's camera view is *always* trying to decode that same
// barcode the moment it's mounted, in every test. Tests that use manual
// entry instead click the "Enter barcode manually" toggle immediately after
// landing on the page, which stops the camera; that click is expected to
// win the race against the camera's async startup (dynamic import + camera
// negotiation + first decode attempt), which is slower than a same-tick
// Playwright click. The one test that deliberately lets the camera run
// waits for it on purpose.

test.describe('Scan → price capture', () => {
  test('camera scan of an unknown barcode leads to price entry and persists', async ({
    page,
  }) => {
    await page.goto('/')

    // No mocking of the app's decode logic here — the fake camera feeds a
    // real video of a real EAN-13 barcode, and this waits for the app's
    // actual ZXing pipeline to detect it and advance the flow.
    await expect(page.getByLabel('Product name')).toBeVisible({ timeout: 20_000 })

    await page.getByLabel('Product name').fill('Blue Buffalo Chicken Dog Food')
    await page.getByLabel('Brand (optional)').fill('Blue Buffalo')
    await page.getByLabel('Size (optional)').fill('24')
    await page.getByLabel('Unit').selectOption('lb')
    await page.getByRole('button', { name: 'Continue' }).click()

    await addNewStoreInline(page, 'Tractor Supply')

    await page.getByLabel('Price').fill('67')
    await page.getByRole('button', { name: 'Save price' }).click()

    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()
    await expect(
      page.getByText('Blue Buffalo Chicken Dog Food — $67.00 at Tractor Supply'),
    ).toBeVisible()

    // Confirm it's actually persisted (not just held in component state) by
    // reading it back from a completely different screen. Deliberately not
    // using "Scan another" here: that would remount the camera view, which
    // would immediately redetect the same fixture barcode and race past the
    // state we want to inspect.
    await page.getByRole('link', { name: 'Stores' }).click()
    await expect(page.getByText('Tractor Supply')).toBeVisible()
    await expect(page.getByText('1 price logged')).toBeVisible()
  })

  test('manual entry: re-scanning a known barcode skips the new-product form, and both captures persist', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Enter barcode manually' }).click()
    await page.getByLabel('Barcode number').fill(FIXTURE_BARCODE)
    await page.getByRole('button', { name: 'Look up price' }).click()

    await expect(page.getByLabel('Product name')).toBeVisible()
    await page.getByLabel('Product name').fill('Blue Buffalo Chicken Dog Food')
    await page.getByRole('button', { name: 'Continue' }).click()

    await addNewStoreInline(page, 'Tractor Supply')
    await page.getByLabel('Price').fill('67')
    await page.getByRole('button', { name: 'Save price' }).click()
    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()

    await page.getByRole('button', { name: 'Scan another' }).click()

    // Same barcode, second store, different price — the product already
    // exists, so this should go straight to price entry.
    await page.getByRole('button', { name: 'Enter barcode manually' }).click()
    await page.getByLabel('Barcode number').fill(FIXTURE_BARCODE)
    await page.getByRole('button', { name: 'Look up price' }).click()

    await expect(page.getByLabel('Product name')).not.toBeVisible()
    await expect(page.getByText('Blue Buffalo Chicken Dog Food', { exact: false })).toBeVisible()

    await addNewStoreInline(page, 'PetCo')
    await page.getByLabel('Price').fill('74')
    await page.getByRole('button', { name: 'Save price' }).click()

    await expect(page.getByText('Blue Buffalo Chicken Dog Food — $74.00 at PetCo')).toBeVisible()

    // Both stores should have picked up exactly one logged price each.
    await page.getByRole('link', { name: 'Stores' }).click()
    const tractorSupplyRow = page.locator('li', { hasText: 'Tractor Supply' })
    const petcoRow = page.locator('li', { hasText: 'PetCo' })
    await expect(tractorSupplyRow.getByText('1 price logged')).toBeVisible()
    await expect(petcoRow.getByText('1 price logged')).toBeVisible()
  })
})
