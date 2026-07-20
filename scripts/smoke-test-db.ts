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
  createShoppingList,
  addShoppingListItem,
  listItemsForList,
  listShoppingListsWithCounts,
  setShoppingListItemStore,
  setShoppingListItemPurchased,
  deleteShoppingListItem,
  deleteShoppingList,
  createImportedProduct,
} from '../src/lib/db.ts'
import { computeUnitPrice } from '../src/lib/unitPrice.ts'
import { extractNameCandidates, extractPriceCandidates } from '../src/lib/priceOcr.ts'

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

  // 12. M4: shopping lists — the exit-criteria scenario ("build a 'dog
  // supplies' list, see it grouped by store, reassign one item to a
  // different store, check items off during a mock trip").
  const listId = await createShoppingList('Dog supplies')
  const gadgetId = await createProduct({ barcode: '999888777666', name: 'Unpriced Gadget' })

  const widgetItemId = await addShoppingListItem({ listId, productId: widgetId, quantity: 2 })
  await addShoppingListItem({ listId, productId: gadgetId, quantity: 1 })

  let listItems = await listItemsForList(listId)
  assert.equal(listItems.length, 2)
  const widgetItem = listItems.find((i) => i.id === widgetItemId)!
  const gadgetItem = listItems.find((i) => i.productId === gadgetId)!

  // No override yet: Widget should default to whichever store is currently
  // cheapest (Sale Store, from the M3 scenario above).
  assert.equal(widgetItem.effectiveStore?.name, 'Sale Store')
  assert.equal(widgetItem.effectivePrice, 2)
  assert.equal(widgetItem.quantity, 2)
  // A product with no price history at all has no effective store or price
  // — it should show up in a "no price yet" group, not crash.
  assert.equal(gadgetItem.effectiveStore, undefined)
  assert.equal(gadgetItem.effectivePrice, undefined)

  // Adding the same not-yet-purchased product again bumps quantity instead
  // of creating a duplicate row.
  await addShoppingListItem({ listId, productId: widgetId, quantity: 1 })
  listItems = await listItemsForList(listId)
  assert.equal(listItems.length, 2, 'adding an already-listed product should not create a duplicate row')
  assert.equal(listItems.find((i) => i.id === widgetItemId)!.quantity, 3)

  // Reassign Widget to Regular Store even though it's not the cheapest —
  // the override should win over the auto-cheapest default.
  await setShoppingListItemStore(widgetItemId, regularStoreId)
  listItems = await listItemsForList(listId)
  const reassignedWidget = listItems.find((i) => i.id === widgetItemId)!
  assert.equal(reassignedWidget.effectiveStore?.name, 'Regular Store')
  assert.equal(reassignedWidget.effectivePrice, 3, "should reflect Regular Store's price, not the cheapest")

  // Check it off during a "mock trip" — purchasedStoreId should capture
  // wherever it was actually grouped (Regular Store) at that moment.
  await setShoppingListItemPurchased(widgetItemId, true, reassignedWidget.effectiveStore?.id)
  listItems = await listItemsForList(listId)
  const purchasedWidget = listItems.find((i) => i.id === widgetItemId)!
  assert.equal(purchasedWidget.purchased, true)
  assert.ok(purchasedWidget.purchasedAt !== undefined)
  assert.equal(purchasedWidget.purchasedStoreId, regularStoreId)

  const listSummaries = await listShoppingListsWithCounts()
  const dogSuppliesSummary = listSummaries.find((l) => l.id === listId)
  assert.equal(dogSuppliesSummary?.itemCount, 2)
  assert.equal(dogSuppliesSummary?.purchasedCount, 1)

  // Removing an item and deleting the whole list both clean up properly.
  const gadgetItemId = gadgetItem.id
  await deleteShoppingListItem(gadgetItemId)
  listItems = await listItemsForList(listId)
  assert.equal(listItems.length, 1, 'removed item should be gone')

  await deleteShoppingList(listId)
  const summariesAfterDelete = await listShoppingListsWithCounts()
  assert.equal(
    summariesAfterDelete.some((l) => l.id === listId),
    false,
    'deleted list should not show up in the list summary',
  )
  assert.equal(
    await db.shoppingListItems.where('listId').equals(listId).count(),
    0,
    'deleting a list should cascade-delete its items',
  )

  // 13. M5.5: screenshot import — no barcode, so a synthetic one is
  // generated, and it must never collide with a real scanned barcode or
  // with another imported product's synthetic one.
  const importedA = await createImportedProduct({ name: 'Imported Widget' })
  const importedB = await createImportedProduct({ name: 'Another Imported Thing' })
  assert.ok(importedA.barcode.startsWith('import:'), 'synthetic barcode should use the recognizable prefix')
  assert.notEqual(importedA.barcode, importedB.barcode, 'two imports should never collide')
  const rereadImportedA = await db.products.get(importedA.id)
  assert.equal(rereadImportedA?.name, 'Imported Widget', 'the returned product should match what actually got written')

  // Name-candidate extraction: a product-title-ish line should win over a
  // pure price/rating line, and a price-only screenshot still yields no
  // name candidates rather than crashing.
  const screenshotText = 'In Stock\nBlue Buffalo Chicken Dog Food, 24 lb Bag\n4.5 out of 5 stars\n$67.00\nAdd to Cart'
  const nameCandidates = extractNameCandidates(screenshotText)
  assert.ok(nameCandidates.length > 0, 'should find at least one name candidate')
  assert.equal(nameCandidates[0], 'Blue Buffalo Chicken Dog Food, 24 lb Bag', 'the product title line should rank first')
  assert.equal(extractNameCandidates('$12.99\n$0.99/oz').length, 0, 'a price-only screenshot should yield no name candidates')
  const screenshotPrices = extractPriceCandidates(screenshotText)
  assert.deepEqual(screenshotPrices.map((c) => c.value), [67], 'should still find the price on the same screenshot')

  console.log('✓ smoke test passed: capture, lookup, retrieval, and cross-store comparison all work as expected')
}

main().catch((err) => {
  console.error('✗ smoke test failed')
  console.error(err)
  process.exitCode = 1
})
