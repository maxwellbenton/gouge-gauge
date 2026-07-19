// Smoke test for the local data layer (src/lib/db.ts), run against
// fake-indexeddb so it can execute in Node/CI without a real browser.
// Not part of the app bundle — a quick way to verify the M1 exit criteria
// end-to-end: "scan Blue Buffalo dog food at Tractor Supply, enter $67, and
// see it saved and retrievable."
//
// Run with: npx tsx scripts/smoke-test-db.ts

import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import {
  db,
  createProduct,
  createStore,
  createPriceEntry,
  getProductByBarcode,
  listRecentPriceEntries,
  listStoresWithCounts,
} from '../src/lib/db.ts'

async function main() {
  const barcode = '040232013408' // arbitrary UPC for the test

  // 1. First store: Tractor Supply
  const tractorSupplyId = await createStore({ name: 'Tractor Supply' })
  const productId = await createProduct({
    barcode,
    name: 'Blue Buffalo Chicken Dog Food',
    brand: 'Blue Buffalo',
    sizeValue: 24,
    sizeUnit: 'lb',
  })
  await createPriceEntry({
    productId,
    storeId: tractorSupplyId,
    price: 67,
    isSale: false,
    source: 'manual',
  })

  // 2. Scanning the same barcode again should resolve to the same product —
  // this is the thing that lets M2's comparison view work at all.
  const lookedUp = await getProductByBarcode(barcode)
  assert.ok(lookedUp, 'product should be findable by barcode')
  assert.equal(lookedUp.id, productId)
  assert.equal(lookedUp.name, 'Blue Buffalo Chicken Dog Food')

  // 3. Second store: PetCo, same product, different price
  const petcoId = await createStore({ name: 'PetCo' })
  await createPriceEntry({
    productId,
    storeId: petcoId,
    price: 74,
    isSale: false,
    source: 'manual',
  })

  // 4. Saved data is retrievable, newest first
  const recent = await listRecentPriceEntries(10)
  assert.equal(recent.length, 2, 'both price entries should be retrievable')
  assert.equal(recent[0].store.name, 'PetCo', 'most recent capture should be first')
  assert.equal(recent[0].price, 74)
  assert.equal(recent[1].store.name, 'Tractor Supply')
  assert.equal(recent[1].price, 67)

  // 5. Store management: both stores show up with correct counts, and
  // capturing a price bumps lastUsedAt so recently-used stores sort first.
  const stores = await listStoresWithCounts()
  assert.equal(stores.length, 2)
  const tractorSupply = stores.find((s) => s.id === tractorSupplyId)
  const petco = stores.find((s) => s.id === petcoId)
  assert.equal(tractorSupply?.priceEntryCount, 1)
  assert.equal(petco?.priceEntryCount, 1)
  assert.ok(
    (await db.stores.get(petcoId))!.lastUsedAt >= (await db.stores.get(tractorSupplyId))!.lastUsedAt,
    'most recently captured store should have the later lastUsedAt',
  )

  // 6. Unknown barcode still resolves to "not found" rather than throwing.
  const unknown = await getProductByBarcode('000000000000')
  assert.equal(unknown, undefined)

  console.log('✓ smoke test passed: capture, lookup, and retrieval all work as expected')
}

main().catch((err) => {
  console.error('✗ smoke test failed')
  console.error(err)
  process.exitCode = 1
})
