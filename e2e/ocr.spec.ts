import { expect } from '@playwright/test'
import { test } from './test-fixtures.js'
import { addNewStoreInline } from './helpers.js'
import { routeTesseractCdnToLocal } from './ocr-cdn-route.js'

// Manual entry never touches the camera/decode pipeline — arbitrary
// non-fixture barcode, same approach as compare.spec.ts / lists.spec.ts.
const KIBBLE_BARCODE = '900000000006'

const fixture = (name: string) => new URL(`./fixtures/ocr/${name}`, import.meta.url).pathname

test('OCR: photo-to-price prefill, single price, multiple prices, and no price found', async ({
  page,
  context,
}) => {
  // Real tesseract.js: real recognition, run against the synthetic fixtures
  // in e2e/fixtures/ocr/ (see scripts/generate-ocr-spike-fixtures.py). Only
  // the CDN fetch for the wasm core/traineddata is rerouted to local copies
  // — see ocr-cdn-route.ts for why.
  await routeTesseractCdnToLocal(context)

  await page.goto('/')
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(KIBBLE_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Store Brand Kibble')
  await page.getByRole('button', { name: 'Continue' }).click()
  await addNewStoreInline(page, 'Test Mart')

  const scanButton = page.getByRole('button', { name: /Scan price from a photo/ })
  const priceInput = page.getByLabel('Price', { exact: true })

  // Single clean price: prefills the Price field automatically.
  await page.getByLabel('Scan price from a photo').setInputFiles(fixture('simple_clean.png'))
  await expect(scanButton).toHaveText('Scan price from a photo (beta)', { timeout: 20_000 })
  await expect(priceInput).toHaveValue('12.99')

  // Two prices in the photo (sale vs. regular): doesn't guess — shows both
  // as chips and waits for the user to pick.
  await page.getByLabel('Scan price from a photo').setInputFiles(fixture('sale_vs_reg.png'))
  await expect(scanButton).toHaveText('Scan price from a photo (beta)', { timeout: 20_000 })
  await expect(page.getByText('Found more than one price')).toBeVisible()
  await page.getByRole('button', { name: '$3.99' }).click()
  await expect(priceInput).toHaveValue('3.99')

  // No price in the photo: says so, and leaves whatever price is already
  // entered untouched rather than clearing it.
  await page.getByLabel('Scan price from a photo').setInputFiles(fixture('no_price.png'))
  await expect(scanButton).toHaveText('Scan price from a photo (beta)', { timeout: 20_000 })
  await expect(page.getByText("Couldn't find a price in that photo")).toBeVisible()
  await expect(priceInput).toHaveValue('3.99')

  // OCR only ever prefills — saving still requires the normal explicit
  // confirm step.
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Store Brand Kibble — $3.99 at Test Mart')).toBeVisible()
})
