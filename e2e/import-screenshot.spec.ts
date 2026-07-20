import { expect } from '@playwright/test'
import { test } from './test-fixtures.js'
import { addNewStoreInline } from './helpers.js'
import { routeTesseractCdnToLocal } from './ocr-cdn-route.js'

const fixture = (name: string) => new URL(`./fixtures/ocr/${name}`, import.meta.url).pathname

test('Screenshot import: OCR prefills name + price, and reusing the same screenshot offers the already-logged product instead of duplicating it', async ({
  page,
  context,
}) => {
  // Real tesseract.js recognition, same as ocr.spec.ts — only the CDN
  // fetch for the wasm core/traineddata is rerouted to local copies.
  await routeTesseractCdnToLocal(context)

  await page.goto('/')
  await page
    .getByRole('link', { name: 'Shopping online instead? Import from a screenshot' })
    .click()
  await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible()

  // --- First import: no matching product yet, so this creates one. ---
  await page.getByLabel('Screenshot').setInputFiles(fixture('simple_clean.png'))

  const nameInput = page.getByLabel('Product name')
  await expect(nameInput).toHaveValue('STORE BRAND KIBBLE', { timeout: 20_000 })
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('12.99')

  // The image's other OCR'd line is offered as an alternate reading, not
  // silently discarded — same "never guess silently" principle as M5's
  // multi-price chips.
  await expect(page.getByRole('button', { name: 'PRICE $12.99', exact: true })).toBeVisible()

  // Nothing to match against yet.
  await expect(page.getByText('Already logged')).not.toBeVisible()

  await page.getByRole('button', { name: 'Continue as new product' }).click()
  await addNewStoreInline(page, 'Web Store')

  // The price field already holds what OCR found on this same screenshot
  // — PriceEntryForm never re-scans a photo it was never given.
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('12.99')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('STORE BRAND KIBBLE — $12.99 at Web Store')).toBeVisible()

  // --- Second import of the *same* screenshot: should offer the product
  // that already exists instead of quietly creating a duplicate. ---
  await page.getByRole('button', { name: 'Import another' }).click()
  await page.getByLabel('Screenshot').setInputFiles(fixture('simple_clean.png'))
  await expect(nameInput).toHaveValue('STORE BRAND KIBBLE', { timeout: 20_000 })

  await expect(
    page.getByText('Already logged — use this instead of creating a new one?'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'STORE BRAND KIBBLE', exact: true }).click()

  // Jumped straight into price entry for the *existing* product — its
  // already-known price at Web Store is right there in the comparison,
  // proving this is the same product, not a fresh one.
  await expect(page.getByText('Web Store')).toBeVisible()
  await addNewStoreInline(page, 'App Store')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('STORE BRAND KIBBLE — $12.99 at App Store')).toBeVisible()
})
