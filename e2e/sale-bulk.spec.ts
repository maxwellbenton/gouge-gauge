import { expect } from '@playwright/test'
import { test } from './test-fixtures.js'
import { addNewStoreInline } from './helpers.js'

// Manual entry never touches the camera/decode pipeline — an arbitrary
// non-fixture barcode is enough here, same approach as compare.spec.ts.
const WIDGET_BARCODE = '900000000003'

test('sale and bulk deals: a BOGO and a time-limited sale both rank correctly in comparisons', async ({
  page,
}) => {
  await page.goto('/')

  // Discount Mart: a BOGO deal — pay $5 for one, get a second free.
  // Logged as quantity 2, total price $5 → effective $2.50 each.
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(WIDGET_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  await page.getByLabel('Product name').fill('Widget')
  await page.getByRole('button', { name: 'Continue' }).click()

  await addNewStoreInline(page, 'Discount Mart')
  await page.getByLabel('Bulk deal (e.g. "3 for $10")').check()
  await page.getByLabel('Quantity included').fill('2')
  await page.getByLabel('Total price for the deal').fill('5')
  await expect(page.getByText('= $2.50 each')).toBeVisible()
  await page.getByRole('button', { name: 'Save price' }).click()

  await expect(page.getByText('Widget — $5.00 at Discount Mart')).toBeVisible()
  await expect(page.getByText('2 for $5.00 — $2.50 each')).toBeVisible()

  // Sale Store: an active time-limited sale, cheaper than the BOGO.
  await page.getByRole('button', { name: 'Scan another' }).click()
  await page.getByRole('button', { name: 'Enter barcode manually' }).click()
  await page.getByLabel('Barcode number').fill(WIDGET_BARCODE)
  await page.getByRole('button', { name: 'Look up price' }).click()

  // The BOGO from Discount Mart should already be visible here, before
  // this capture is even saved — the same "immediately see prior prices"
  // behavior M2 established, now correctly showing deal pricing too.
  await expect(page.getByText('Only price on file')).toBeVisible()
  await expect(page.getByText('$2.50 each')).toBeVisible()
  await expect(page.getByText('2 for $5.00')).toBeVisible()

  await addNewStoreInline(page, 'Sale Store')
  await page.getByLabel('This is a sale price').check()
  const saleEndDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Sale ends (optional)').fill(saleEndDate)
  await page.getByLabel('Price').fill('2')
  await page.getByRole('button', { name: 'Save price' }).click()

  await expect(page.getByText('Widget — $2.00 at Sale Store')).toBeVisible()

  // --- Compare tab: both deals ranked correctly by effective price ---
  await page.getByRole('link', { name: 'Compare' }).click()
  await page.getByRole('button', { name: /Widget/ }).click()
  await expect(page.getByRole('heading', { name: 'Widget' })).toBeVisible()
  await expect(page.getByText('Known prices — 2 stores')).toBeVisible()

  const saleStoreRow = page.locator('li', { hasText: 'Sale Store' })
  const discountMartRow = page.locator('li', { hasText: 'Discount Mart' })

  await expect(saleStoreRow.getByText('Cheapest')).toBeVisible()
  await expect(saleStoreRow.getByText('Sale')).toBeVisible()
  await expect(saleStoreRow.getByText(/ends/)).toBeVisible()
  await expect(saleStoreRow.getByText('$2.00')).toBeVisible()

  await expect(discountMartRow.getByText('$2.50 each')).toBeVisible()
  await expect(discountMartRow.getByText('2 for $5.00')).toBeVisible()
})
