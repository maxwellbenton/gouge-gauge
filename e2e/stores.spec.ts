import { test, expect } from '@playwright/test'

test('adding a store directly from the Stores page', async ({ page }) => {
  // Navigating straight to /stores never mounts the Scan page's camera
  // view, so this test has no interaction with the fake video device at all.
  await page.goto('/stores')

  await expect(page.getByText('No stores yet')).toBeVisible()

  await page.getByLabel('Name').fill('Costco')
  await page.getByLabel('Location (optional)').fill('Warehouse Way')
  await page.getByRole('button', { name: 'Add store' }).click()

  await expect(page.getByText('No stores yet')).not.toBeVisible()
  await expect(page.getByText('Costco')).toBeVisible()
  await expect(page.getByText('Warehouse Way')).toBeVisible()
  await expect(page.getByText('0 prices logged')).toBeVisible()
})
