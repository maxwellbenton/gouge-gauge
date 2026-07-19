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
  effectivePrice,
  getProductByBarcode,
  listRecentPriceEntries,
  listStoresWithCounts,
  listLatestPriceEntriesForProduct,
  listProductsWithBestPrice,
  updateProductSize,
} from '../src/lib/db.ts'
import { computeUnitPrice } from '../src/lib/unitPrice.ts'

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
  if (!lookedUp) throw new Error('product should be findable by barcode')
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

  // 7. M2: cross-store comparison. This is the exact exit-criteria scenario
  // — scan Blue Buffalo at PetCo after it's already logged at Tractor
  // Supply, and Tractor Supply should read as the cheaper option.
  const comparison = await listLatestPriceEntriesForProduct(productId)
  assert.equal(comparison.length, 2, 'both stores should have a latest price for this product')
  const bySName = new Map(comparison.map((e) => [e.store.name, e]))
  assert.equal(bySName.get('Tractor Supply')?.price, 67)
  assert.equal(bySName.get('PetCo')?.price, 74)
  assert.ok(
    (bySName.get('Tractor Supply')?.price ?? Infinity) < (bySName.get('PetCo')?.price ?? -Infinity),
    'Tractor Supply should be cheaper than PetCo',
  )

  // 8. Unit price: same product, same declared size, so price and unit
  // price must rank stores identically.
  const tsUnit = computeUnitPrice(67, lookedUp)
  const petcoUnit = computeUnitPrice(74, lookedUp)
  assert.ok(tsUnit && petcoUnit, 'unit price should compute when the product has a size')
  assert.equal(tsUnit!.label, '$2.79/lb')
  assert.ok(tsUnit!.value < petcoUnit!.value, 'cheaper sticker price should also be the cheaper unit price')

  // 9. Products without a size fall back gracefully (no unit price), and
  // can have a size added after the fact.
  const noSizeProductId = await createProduct({ barcode: '011110038364', name: 'Store-brand kibble' })
  const noSizeProduct = await db.products.get(noSizeProductId)
  assert.equal(computeUnitPrice(20, noSizeProduct!), null, 'no size on file should mean no unit price')
  await updateProductSize(noSizeProductId, 15, 'lb')
  const resizedProduct = await db.products.get(noSizeProductId)
  assert.ok(computeUnitPrice(20, resizedProduct!) !== null, 'unit price should compute once a size is added')

  // 10. A product with zero price entries (e.g. created but never priced)
  // shouldn't crash the comparison lookup or the browse summary.
  const neverPricedId = await createProduct({ barcode: '000111222333', name: 'Never priced' })
  assert.deepEqual(await listLatestPriceEntriesForProduct(neverPricedId), [])

  const summaries = await listProductsWithBestPrice()
  const blueBuffaloSummary = summaries.find((s) => s.product.id === productId)
  assert.equal(blueBuffaloSummary?.storeCount, 2)
  assert.equal(blueBuffaloSummary?.bestEntry?.store.name, 'Tractor Supply')
  assert.equal(blueBuffaloSummary?.bestEntry?.price, 67)
  const neverPricedSummary = summaries.find((s) => s.product.id === neverPricedId)
  assert.equal(neverPricedSummary?.storeCount, 0)
  assert.equal(neverPricedSummary?.bestEntry, null)

  // 11. M3: bulk/BOGO deals and time-limited sales — the exit-criteria
  // scenario ("log a BOGO deal and a time-limited sale price, see both
  // reflected correctly in comparisons").
  const widgetId = await createProduct({ barcode: '555000111222', name: 'Widget' })
  const discountMartId = await createStore({ name: 'Discount Mart' })
  const regularStoreId = await createStore({ name: 'Regular Store' })
  const saleStoreId = await createStore({ name: 'Sale Store' })
  const oldSaleStoreId = await createStore({ name: 'Old Sale Store' })
  const now = Date.now()

  // BOGO at Discount Mart: pay $5 for one, get a second free — logged as
  // price: 5 (what was actually paid), bulkQty: 2 (items received).
  await createPriceEntry({
    productId: widgetId,
    storeId: discountMartId,
    price: 5,
    bulkQty: 2,
    isSale: false,
    source: 'manual',
  })

  // Regular Store: a plain $3 price, then — more recently — an *expired*
  // sale. The expired sale shouldn't be treated as this store's current
  // price; the older, still-valid $3 should win instead.
  await createPriceEntry({
    productId: widgetId,
    storeId: regularStoreId,
    price: 3,
    isSale: false,
    source: 'manual',
    capturedAt: now - 60_000,
  })
  await createPriceEntry({
    productId: widgetId,
    storeId: regularStoreId,
    price: 1.5,
    isSale: true,
    saleEndsAt: now - 1_000,
    source: 'manual',
    capturedAt: now - 30_000,
  })

  // Sale Store: an *active* time-limited sale, cheaper than everything else.
  await createPriceEntry({
    productId: widgetId,
    storeId: saleStoreId,
    price: 2,
    isSale: true,
    saleEndsAt: now + 86_400_000,
    source: 'manual',
  })

  // Old Sale Store: its *only* entry is an expired sale — it should drop
  // out of the comparison entirely rather than show a stale deal price.
  await createPriceEntry({
    productId: widgetId,
    storeId: oldSaleStoreId,
    price: 1,
    isSale: true,
    saleEndsAt: now - 1_000,
    source: 'manual',
  })

  const widgetComparison = await listLatestPriceEntriesForProduct(widgetId)
  const widgetByStore = new Map(widgetComparison.map((e) => [e.store.name, e]))

  assert.equal(widgetComparison.length, 3, 'the expired-only store should be excluded entirely')
  assert.equal(widgetByStore.has('Old Sale Store'), false)

  const bogoEntry = widgetByStore.get('Discount Mart')
  assert.ok(bogoEntry, 'BOGO entry should be present')
  assert.equal(bogoEntry!.price, 5, 'raw price is the deal total, not the per-item price')
  assert.equal(bogoEntry!.bulkQty, 2)
  assert.equal(effectivePrice(bogoEntry!), 2.5, 'BOGO effective price should be $5 / 2 items')

  const regularEntry = widgetByStore.get('Regular Store')
  assert.ok(regularEntry, 'Regular Store should fall back to its non-expired price')
  assert.equal(regularEntry!.price, 3, 'the expired sale should not override the still-valid $3 price')
  assert.equal(effectivePrice(regularEntry!), 3)

  const saleEntry = widgetByStore.get('Sale Store')
  assert.ok(saleEntry, 'active sale entry should be present')
  assert.equal(effectivePrice(saleEntry!), 2)

  // Ranked by effective price: Sale Store ($2) < Discount Mart BOGO ($2.50) < Regular Store ($3).
  const rankedByEffectivePrice = [...widgetComparison].sort(
    (a, b) => effectivePrice(a) - effectivePrice(b),
  )
  assert.deepEqual(
    rankedByEffectivePrice.map((e) => e.store.name),
    ['Sale Store', 'Discount Mart', 'Regular Store'],
  )

  const widgetSummaries = await listProductsWithBestPrice()
  const widgetSummary = widgetSummaries.find((s) => s.product.id === widgetId)
  assert.equal(widgetSummary?.storeCount, 3, 'the expired-only store should not count toward storeCount either')
  assert.equal(widgetSummary?.bestEntry?.store.name, 'Sale Store', 'best price should account for the active sale')
  assert.equal(
    widgetSummary?.bestEntry && effectivePrice(widgetSummary.bestEntry),
    2,
    'best price should be the effective (per-item) price, not a raw deal total',
  )

  console.log('✓ smoke test passed: capture, lookup, retrieval, and cross-store comparison all work as expected')
}

main().catch((err) => {
  console.error('✗ smoke test failed')
  console.error(err)
  process.exitCode = 1
})
