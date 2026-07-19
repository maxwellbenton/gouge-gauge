import { expect, type Page } from '@playwright/test'

/**
 * Drives the inline "+ Add a new store" flow inside StorePicker and waits
 * for it to actually finish before returning.
 *
 * Why this matters: clicking "Add store" calls an async `createStore()`
 * (an IndexedDB write) and only calls the parent form's `onChange(id)` —
 * which is what actually makes the new store usable — after that resolves.
 * Playwright's `.click()` returns as soon as the click event dispatches, not
 * once the handler's internal awaits finish. Continuing immediately (e.g.
 * filling Price and clicking Save) races that: the price form's `storeId`
 * may still be null, so "Save price" silently no-ops via the
 * `if (!storeId) { setError(...); return }` guard instead of saving.
 *
 * StorePicker only switches back from its "adding" sub-form to the normal
 * dropdown view in the same state update that calls `onChange(id)`, so
 * waiting for the "+ Add a new store" link to reappear is a reliable signal
 * that the store is actually selected, not just that the click happened.
 */
export async function addNewStoreInline(page: Page, storeName: string): Promise<void> {
  await page.getByRole('button', { name: '+ Add a new store' }).click()
  await page.getByLabel('New store name').fill(storeName)
  await page.getByRole('button', { name: 'Add store' }).click()
  await expect(page.getByRole('button', { name: '+ Add a new store' })).toBeVisible()
}
