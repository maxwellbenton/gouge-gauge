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
  /** Sticker/shelf price actually paid, in dollars. */
  price: number
  isSale: boolean
  saleEndsAt?: number
  /** Free-text bulk/deal label, e.g. "3 for $10". Effective unit pricing lands in M3. */
  bulkQty?: string
  capturedAt: number
  source: 'manual' | 'ocr'
}

class GougeGaugeDB extends Dexie {
  products!: EntityTable<Product, 'id'>
  stores!: EntityTable<Store, 'id'>
  priceEntries!: EntityTable<PriceEntry, 'id'>

  constructor() {
    super('gougegauge')
    this.version(1).stores({
      products: '++id, &barcode, name',
      stores: '++id, name, lastUsedAt',
      priceEntries: '++id, productId, storeId, capturedAt, [productId+storeId]',
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

function latestPerStore(entries: PriceEntry[]): PriceEntry[] {
  const latestByStore = new Map<number, PriceEntry>()
  for (const entry of entries) {
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
      const bestEntry = enriched.reduce<EnrichedPriceEntry | null>(
        (best, entry) => (!best || entry.price < best.price ? entry : best),
        null,
      )
      return { product, storeCount: enriched.length, bestEntry }
    })
    .sort((a, b) => b.product.createdAt - a.product.createdAt)
}
