import Dexie, { type EntityTable } from 'dexie'

// --- Data model -------------------------------------------------------
// See docs/DESIGN.md §4. Price entries are append-only: every scan creates
// a new row rather than overwriting a prior price, which is what lets sale
// history, price trends, and (later) multi-user merges coexist safely.

export interface Product {
  id: number
  /** UPC/EAN barcode, as scanned. Unique. */
  barcode: string
  name: string
  brand?: string
  /** e.g. 24 for "24 lb bag" — optional, but needed for unit-price comparisons later. */
  sizeValue?: number
  sizeUnit?: SizeUnit
  createdAt: number
}

export const SIZE_UNITS = ['lb', 'oz', 'kg', 'g', 'fl oz', 'gal', 'L', 'ct'] as const
export type SizeUnit = (typeof SIZE_UNITS)[number]

export interface Store {
  id: number
  name: string
  location?: string
  createdAt: number
  /** Bumped every time a price is captured here, so recent stores sort first. */
  lastUsedAt: number
}

export interface PriceEntry {
  id: number
  productId: number
  storeId: number
  /**
   * Price actually paid. For a bulk/multi-buy deal (bulkQty set), this is
   * the *total* for the deal — e.g. price: 10, bulkQty: 3 for "3 for $10"
   * — not the per-item price. See `effectivePrice()` in lib/unitPrice.ts
   * for the per-item figure everything else (ranking, unit price) uses.
   */
  price: number
  isSale: boolean
  /** Sale entries with a past saleEndsAt are excluded from comparisons by
   * default (see `latestPerStore` below) rather than treated as the
   * store's current price. */
  saleEndsAt?: number
  /** Item count for a bulk/multi-buy deal, e.g. 3 for "3 for $10", or 2 for
   * a BOGO logged as "pay for 1, get 2" (price: single-item price, bulkQty: 2). */
  bulkQty?: number
  capturedAt: number
  source: 'manual' | 'ocr'
}

export interface ShoppingList {
  id: number
  name: string
  createdAt: number
}

export interface ShoppingListItem {
  id: number
  listId: number
  productId: number
  /** Explicit "buy this at X regardless of price" override. Undefined means
   * "use whichever store currently has the cheapest known price" — computed
   * live (see `listItemsForList`), not frozen at add-time, so the grouping
   * stays current as new prices get logged. */
  targetStoreId?: number
  quantity: number
  purchased: boolean
  purchasedAt?: number
  /** May differ from targetStoreId — captures "I know X was cheaper but I
   * grabbed it at Y anyway." Set automatically to whatever store the item
   * was grouped under at the moment it was checked off. */
  purchasedStoreId?: number
  createdAt: number
}

class GougeGaugeDB extends Dexie {
  products!: EntityTable<Product, 'id'>
  stores!: EntityTable<Store, 'id'>
  priceEntries!: EntityTable<PriceEntry, 'id'>
  shoppingLists!: EntityTable<ShoppingList, 'id'>
  shoppingListItems!: EntityTable<ShoppingListItem, 'id'>

  constructor() {
    super('gougegauge')
    this.version(1).stores({
      products: '++id, &barcode, name',
      stores: '++id, name, lastUsedAt',
      priceEntries: '++id, productId, storeId, capturedAt, [productId+storeId]',
      shoppingLists: '++id, name, createdAt',
      shoppingListItems: '++id, listId, productId, purchased',
    })
  }
}

export const db = new GougeGaugeDB()

// --- Helpers ------------------------------------------------------------
// Thin wrappers around the obvious Dexie calls aren't included here on
// purpose — components query `db.*` directly via useLiveQuery. These
// helpers exist only where there's real logic (id lookups, touching
// lastUsedAt, etc).

export async function getProductByBarcode(barcode: string): Promise<Product | undefined> {
  return db.products.where('barcode').equals(barcode).first()
}

export async function createProduct(
  input: Omit<Product, 'id' | 'createdAt'>,
): Promise<number> {
  return db.products.add({ ...input, createdAt: Date.now() })
}

/** Products imported from a screenshot (M5.5) have no real scanned
 * barcode — but `barcode` is a required, unique field everywhere else in
 * the schema (see `products: '++id, &barcode, name'` above), and every
 * other lookup/comparison in the app assumes it's a real, non-empty
 * string. Rather than loosen that constraint, synthesize a barcode with a
 * recognizable, never-scannable prefix — keeps the schema and every
 * existing barcode-keyed query untouched. `barcode` is never rendered in
 * the UI, so the synthetic value never leaks out. */
export async function createImportedProduct(
  input: Omit<Product, 'id' | 'createdAt' | 'barcode'>,
): Promise<Product> {
  const barcode = `import:${crypto.randomUUID()}`
  const id = await createProduct({ ...input, barcode })
  const product = await db.products.get(id)
  if (!product) throw new Error('Failed to read back the product that was just created')
  return product
}

export async function createStore(
  input: Omit<Store, 'id' | 'createdAt' | 'lastUsedAt'>,
): Promise<number> {
  const now = Date.now()
  return db.stores.add({ ...input, createdAt: now, lastUsedAt: now })
}

export async function touchStore(storeId: number): Promise<void> {
  await db.stores.update(storeId, { lastUsedAt: Date.now() })
}

export async function createPriceEntry(
  input: Omit<PriceEntry, 'id' | 'capturedAt'> & { capturedAt?: number },
): Promise<number> {
  const capturedAt = input.capturedAt ?? Date.now()
  const id = await db.priceEntries.add({ ...input, capturedAt })
  await touchStore(input.storeId)
  return id
}

export interface EnrichedPriceEntry extends PriceEntry {
  product: Product
  store: Store
}

/** Most recent captures, newest first, with product/store joined in. Dexie
 * has no native join — for a local dataset this size, doing it in JS is fine. */
export async function listRecentPriceEntries(limit = 10): Promise<EnrichedPriceEntry[]> {
  const entries = await db.priceEntries.orderBy('capturedAt').reverse().limit(limit).toArray()
  const productIds = [...new Set(entries.map((e) => e.productId))]
  const storeIds = [...new Set(entries.map((e) => e.storeId))]
  const [products, stores] = await Promise.all([
    db.products.bulkGet(productIds),
    db.stores.bulkGet(storeIds),
  ])
  const productMap = new Map(products.filter((p): p is Product => !!p).map((p) => [p.id, p]))
  const storeMap = new Map(stores.filter((s): s is Store => !!s).map((s) => [s.id, s]))
  return entries.flatMap((entry) => {
    const product = productMap.get(entry.productId)
    const store = storeMap.get(entry.storeId)
    return product && store ? [{ ...entry, product, store }] : []
  })
}

export interface StoreWithCount extends Store {
  priceEntryCount: number
}

export async function listStoresWithCounts(): Promise<StoreWithCount[]> {
  const [stores, entries] = await Promise.all([
    db.stores.orderBy('name').toArray(),
    db.priceEntries.toArray(),
  ])
  const counts = new Map<number, number>()
  for (const entry of entries) {
    counts.set(entry.storeId, (counts.get(entry.storeId) ?? 0) + 1)
  }
  return stores.map((store) => ({ ...store, priceEntryCount: counts.get(store.id) ?? 0 }))
}

// --- Cross-store comparison (M2) ----------------------------------------
// A store can have several PriceEntry rows for the same product over time
// (the log is append-only). "Latest per store" collapses that history down
// to "what does this store currently charge", which is what a shopper
// standing in an aisle actually wants to compare — full price history is a
// later concern (M3 sale tracking).

/** The per-item price a shopper actually compares across stores. For a
 * bulk/multi-buy deal, `price` is the deal total (see the PriceEntry
 * comment), so this divides it out; otherwise it's just `price` itself. */
export function effectivePrice(entry: Pick<PriceEntry, 'price' | 'bulkQty'>): number {
  return entry.bulkQty && entry.bulkQty > 1 ? entry.price / entry.bulkQty : entry.price
}

/** A sale entry whose window has closed shouldn't be treated as the
 * store's current price going forward — see the M3 exit criteria in
 * docs/ROADMAP.md ("can exclude expired sales from default comparisons"). */
function isExpiredSale(entry: PriceEntry, now: number): boolean {
  return entry.isSale && entry.saleEndsAt !== undefined && entry.saleEndsAt < now
}

function latestPerStore(entries: PriceEntry[]): PriceEntry[] {
  const now = Date.now()
  const eligible = entries.filter((entry) => !isExpiredSale(entry, now))
  const latestByStore = new Map<number, PriceEntry>()
  for (const entry of eligible) {
    const existing = latestByStore.get(entry.storeId)
    if (!existing || entry.capturedAt > existing.capturedAt) {
      latestByStore.set(entry.storeId, entry)
    }
  }
  return [...latestByStore.values()]
}

/** Latest known price per store for a product, joined with store data. */
export async function listLatestPriceEntriesForProduct(
  productId: number,
): Promise<EnrichedPriceEntry[]> {
  const product = await db.products.get(productId)
  if (!product) return []
  const entries = await db.priceEntries.where('productId').equals(productId).toArray()
  const latest = latestPerStore(entries)
  const stores = await db.stores.bulkGet(latest.map((entry) => entry.storeId))
  const storeMap = new Map(stores.filter((s): s is Store => !!s).map((s) => [s.id, s]))
  return latest.flatMap((entry) => {
    const store = storeMap.get(entry.storeId)
    return store ? [{ ...entry, product, store }] : []
  })
}

export async function updateProductSize(
  productId: number,
  sizeValue: number,
  sizeUnit: SizeUnit,
): Promise<void> {
  await db.products.update(productId, { sizeValue, sizeUnit })
}

export interface ProductSummary {
  product: Product
  /** Number of distinct stores with a known price for this product. */
  storeCount: number
  /** Cheapest of each store's latest price, or null if never priced. */
  bestEntry: EnrichedPriceEntry | null
}

/** The cheapest (by effective per-item price) of a set of already-enriched
 * entries, or null if the list is empty. Shared by the Compare tab's
 * best-price summary and shopping lists' default store assignment. */
function cheapestEntry(entries: EnrichedPriceEntry[]): EnrichedPriceEntry | null {
  return entries.reduce<EnrichedPriceEntry | null>(
    (best, entry) => (!best || effectivePrice(entry) < effectivePrice(best) ? entry : best),
    null,
  )
}

/** All logged products with a quick "cheapest known price" summary, newest
 * product first. Powers the standalone Compare tab's browse list. */
export async function listProductsWithBestPrice(): Promise<ProductSummary[]> {
  const [products, entries, stores] = await Promise.all([
    db.products.toArray(),
    db.priceEntries.toArray(),
    db.stores.toArray(),
  ])
  const storeMap = new Map(stores.map((store) => [store.id, store]))
  const entriesByProduct = new Map<number, PriceEntry[]>()
  for (const entry of entries) {
    const list = entriesByProduct.get(entry.productId)
    if (list) list.push(entry)
    else entriesByProduct.set(entry.productId, [entry])
  }
  return products
    .map((product) => {
      const enriched = latestPerStore(entriesByProduct.get(product.id) ?? []).flatMap((entry) => {
        const store = storeMap.get(entry.storeId)
        return store ? [{ ...entry, product, store }] : []
      })
      return { product, storeCount: enriched.length, bestEntry: cheapestEntry(enriched) }
    })
    .sort((a, b) => b.product.createdAt - a.product.createdAt)
}

// --- Shopping lists (M4) --------------------------------------------------
// A list is just a name; the useful part is what each item resolves to.
// `targetStoreId` on an item is an explicit pin — leave it unset and the
// item follows whichever store is *currently* cheapest, recomputed on every
// read, so a list built last week still reflects this week's prices unless
// the user has deliberately overridden an item.

export async function createShoppingList(name: string): Promise<number> {
  return db.shoppingLists.add({ name, createdAt: Date.now() })
}

export async function deleteShoppingList(listId: number): Promise<void> {
  await db.transaction('rw', db.shoppingLists, db.shoppingListItems, async () => {
    await db.shoppingListItems.where('listId').equals(listId).delete()
    await db.shoppingLists.delete(listId)
  })
}

export interface ShoppingListWithCounts extends ShoppingList {
  itemCount: number
  purchasedCount: number
}

export async function listShoppingListsWithCounts(): Promise<ShoppingListWithCounts[]> {
  const [lists, items] = await Promise.all([
    db.shoppingLists.orderBy('createdAt').toArray(),
    db.shoppingListItems.toArray(),
  ])
  const counts = new Map<number, { itemCount: number; purchasedCount: number }>()
  for (const item of items) {
    const c = counts.get(item.listId) ?? { itemCount: 0, purchasedCount: 0 }
    c.itemCount += 1
    if (item.purchased) c.purchasedCount += 1
    counts.set(item.listId, c)
  }
  return lists.map((list) => ({
    ...list,
    ...(counts.get(list.id) ?? { itemCount: 0, purchasedCount: 0 }),
  }))
}

/** Adds a product to a list, or — if it's already on there and not yet
 * purchased — just bumps the existing row's quantity instead of creating a
 * confusing duplicate. */
export async function addShoppingListItem(input: {
  listId: number
  productId: number
  quantity?: number
}): Promise<number> {
  const existing = await db.shoppingListItems
    .where('listId')
    .equals(input.listId)
    .and((item) => item.productId === input.productId && !item.purchased)
    .first()
  if (existing) {
    await db.shoppingListItems.update(existing.id, {
      quantity: existing.quantity + (input.quantity ?? 1),
    })
    return existing.id
  }
  return db.shoppingListItems.add({
    listId: input.listId,
    productId: input.productId,
    quantity: input.quantity ?? 1,
    purchased: false,
    createdAt: Date.now(),
  })
}

export async function setShoppingListItemStore(
  itemId: number,
  storeId: number | undefined,
): Promise<void> {
  await db.shoppingListItems.update(itemId, { targetStoreId: storeId })
}

export async function setShoppingListItemPurchased(
  itemId: number,
  purchased: boolean,
  purchasedStoreId: number | undefined,
): Promise<void> {
  await db.shoppingListItems.update(itemId, {
    purchased,
    purchasedAt: purchased ? Date.now() : undefined,
    purchasedStoreId: purchased ? purchasedStoreId : undefined,
  })
}

export async function deleteShoppingListItem(itemId: number): Promise<void> {
  await db.shoppingListItems.delete(itemId)
}

export interface EnrichedShoppingListItem extends ShoppingListItem {
  product: Product
  /** The store this item is grouped under: the explicit override if set,
   * otherwise whichever store currently has the cheapest known price.
   * Undefined if there's no known price anywhere yet (and no override). */
  effectiveStore: Store | undefined
  /** Effective per-item price at `effectiveStore`, if known. */
  effectivePrice: number | undefined
}

/** All items on a list, each resolved to the store (and price) it should
 * currently be grouped under. Does one price-comparison lookup per item —
 * fine for a local dataset and a list length a person would actually shop
 * from in one trip. */
export async function listItemsForList(listId: number): Promise<EnrichedShoppingListItem[]> {
  const items = await db.shoppingListItems.where('listId').equals(listId).toArray()
  const productIds = [...new Set(items.map((item) => item.productId))]
  const products = await db.products.bulkGet(productIds)
  const productMap = new Map(products.filter((p): p is Product => !!p).map((p) => [p.id, p]))

  const enriched: EnrichedShoppingListItem[] = []
  for (const item of items) {
    const product = productMap.get(item.productId)
    if (!product) continue
    const comparison = await listLatestPriceEntriesForProduct(item.productId)

    let effectiveStore: Store | undefined
    let effectivePriceValue: number | undefined
    if (item.targetStoreId !== undefined) {
      const overrideEntry = comparison.find((entry) => entry.storeId === item.targetStoreId)
      effectiveStore = overrideEntry?.store ?? (await db.stores.get(item.targetStoreId))
      effectivePriceValue = overrideEntry ? effectivePrice(overrideEntry) : undefined
    } else {
      const cheapest = cheapestEntry(comparison)
      effectiveStore = cheapest?.store
      effectivePriceValue = cheapest ? effectivePrice(cheapest) : undefined
    }

    enriched.push({ ...item, product, effectiveStore, effectivePrice: effectivePriceValue })
  }
  return enriched
}
