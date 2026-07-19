import { expect } from '@playwright/test'
import { test } from './test-fixtures.js'
import { addNewStoreInline } from './helpers.js'

// Manual entry never touches the camera/decode pipeline — arbitrary
// non-fixture barcodes are enough here, same approach as compare.spec.ts.
const DOG_FOOD_BARCODE = '900000000004'
const DOG_TREATS_BARCODE = '900000000005'

test('Shopping lists: build a list, see it grouped by store, reassign an item, and check items off', async ({
  page,
}) => {
  await page.goto('/')

  // Dog Food: logged at two stores, Tractor Supply cheaper.
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(DOG_FOOD_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Dog Food')
  await page.getByRole('button', { name: 'Continue' }).click()

  await addNewStoreInline(page, 'Petco')
  await page.getByLabel('Price', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Dog Food — $20.00 at Petco')).toBeVisible()

  await page.getByRole('button', { name: 'Scan another' }).click()
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(DOG_FOOD_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await addNewStoreInline(page, 'Tractor Supply')
  await page.getByLabel('Price', { exact: true }).fill('15')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Dog Food — $15.00 at Tractor Supply')).toBeVisible()

  // Dog Treats: only ever logged at Petco.
  await page.getByRole('button', { name: 'Scan another' }).click()
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(DOG_TREATS_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Dog Treats')
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Store').selectOption({ label: 'Petco' })
  await page.getByLabel('Price', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save price' }).click()
  await expect(page.getByText('Dog Treats — $5.00 at Petco')).toBeVisible()

  // --- Build the list ---
  await page.getByRole('link', { name: 'Lists' }).click()
  await page.getByLabel('Name').fill('Dog supplies')
  await page.getByRole('button', { name: 'Create list' }).click()
  await expect(page.getByRole('heading', { name: 'Dog supplies' })).toBeVisible()

  await page.getByLabel('Product').selectOption({ label: 'Dog Food' })
  await page.getByLabel('Quantity').fill('2')
  await page.getByRole('button', { name: 'Add to list' }).click()

  await page.getByLabel('Product').selectOption({ label: 'Dog Treats' })
  await page.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: 'Add to list' }).click()

  // Grouped by store: two groups exist, one per store with a price on file.
  await expect(page.getByRole('heading', { name: 'Tractor Supply', level: 3 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Petco', level: 3 })).toBeVisible()

  // Dog Food defaults to Tractor Supply — the cheapest known store — shown
  // with its quantity and per-item price.
  const dogFoodRow = page.locator('li', { hasText: 'Dog Food' })
  await expect(dogFoodRow.getByText('Dog Food ×2')).toBeVisible()
  await expect(dogFoodRow.getByText('$15.00 each')).toBeVisible()

  // Reassign Dog Food to Petco even though it's pricier there — the
  // override should stick and the shown price should update to match.
  await dogFoodRow.getByLabel('Store for Dog Food').selectOption({ label: 'Petco' })
  await expect(dogFoodRow.getByText('$20.00 each')).toBeVisible()

  // Check items off during a "mock trip".
  const dogTreatsRow = page.locator('li', { hasText: 'Dog Treats' })
  await dogTreatsRow.getByRole('checkbox').check()
  await expect(dogTreatsRow.getByRole('checkbox')).toBeChecked()
  await expect(dogFoodRow.getByRole('checkbox')).not.toBeChecked()

  // Back on the list browser, the purchased count should reflect that.
  await page.getByRole('button', { name: '← All lists' }).click()
  await expect(page.getByText('1/2 bought')).toBeVisible()
})
