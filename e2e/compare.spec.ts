import { expect } from '@playwright/test'
import { test } from './test-fixtures.js'
import { addNewStoreInline } from './helpers.js'

// Manual entry never touches the camera/decode pipeline — whatever's typed
// becomes the product's barcode key in Dexie — so these don't need to be
// real, camera-decodable codes the way the fixture videos in scan.spec.ts
// and real-photos/ do. Distinct, arbitrary strings are enough.
const KIBBLE_BARCODE = '900000000001'
const CHEW_TOY_BARCODE = '900000000002'

test('Compare tab: browse logged products by best price, and rank every store for one', async ({
  page,
}) => {
  await page.goto('/')

  // Product 1: "Kibble Deluxe", 10 lb, logged at two stores — a real
  // comparison, and a computable unit price since it has a size on file.
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(KIBBLE_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Kibble Deluxe')
  await page.getByLabel('Size (optional)').fill('10')
  await page.getByLabel('Unit').selectOption('lb')
  await page.getByRole('button', { name: 'Continue' }).click()

  await addNewStoreInline(page, 'Store One')
  await page.getByLabel('Price').fill('20')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible()

  await page.getByRole('button', { name: 'Scan another' }).click()
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(KIBBLE_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await addNewStoreInline(page, 'Store Two')
  await page.getByLabel('Price').fill('18')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Kibble Deluxe — $18.00 at Store Two')).toBeVisible()

  // Product 2: "Chew Toy", no size on file, logged at one store only.
  await page.getByRole('button', { name: 'Scan another' }).click()
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(CHEW_TOY_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Chew Toy')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Store One already exists at this point, so this just picks it.
  await page.getByLabel('Store').selectOption({ label: 'Store One' })
  await page.getByLabel('Price').fill('9.99')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Chew Toy — $9.99 at Store One')).toBeVisible()

  // --- Browse the Compare tab ---
  await page.getByRole('link', { name: 'Compare' }).click()

  const kibbleRow = page.getByRole('button', { name: /Kibble Deluxe/ })
  const chewToyRow = page.getByRole('button', { name: /Chew Toy/ })
  await expect(kibbleRow.getByText('2 stores · best at Store Two')).toBeVisible()
  await expect(kibbleRow.getByText('$18.00')).toBeVisible()
  await expect(chewToyRow.getByText('1 store · best at Store One')).toBeVisible()
  await expect(chewToyRow.getByText('$9.99')).toBeVisible()

  // Drill into Kibble Deluxe: both stores ranked, Store Two (cheaper) first
  // and marked "Cheapest", with a unit price shown for both since the
  // product has a size on file.
  await kibbleRow.click()
  await expect(page.getByRole('heading', { name: 'Kibble Deluxe' })).toBeVisible()
  await expect(page.getByText('Known prices — 2 stores')).toBeVisible()
  const storeTwoRow = page.locator('li', { hasText: 'Store Two' })
  const storeOneRow = page.locator('li', { hasText: 'Store One' })
  await expect(storeTwoRow.getByText('Cheapest')).toBeVisible()
  await expect(storeTwoRow.getByText('$18.00')).toBeVisible()
  await expect(storeTwoRow.getByText('$1.80/lb')).toBeVisible()
  await expect(storeOneRow.getByText('$20.00')).toBeVisible()
  await expect(storeOneRow.getByText('$2.00/lb')).toBeVisible()

  // Back to the list, then into Chew Toy: only one price on file, no size
  // yet so no unit price — and the inline "add a size" prompt should show.
  await page.getByRole('button', { name: '← All products' }).click()
  await expect(kibbleRow).toBeVisible()

  await chewToyRow.click()
  await expect(page.getByRole('heading', { name: 'Chew Toy' })).toBeVisible()
  await expect(page.getByText('Only price on file')).toBeVisible()
  await expect(page.getByText('$9.99')).toBeVisible()
  await expect(page.getByText('Add a size to compare price-per-unit across stores.')).toBeVisible()

  // Add a size after the fact — the comparison should pick it up live
  // (Dexie's useLiveQuery) and start showing a unit price, no reload.
  await page.getByLabel('Size').fill('3')
  await page.getByLabel('Unit').selectOption('ct')
  await page.getByRole('button', { name: 'Save size' }).click()

  await expect(page.getByText('$3.33/ct')).toBeVisible()
})
