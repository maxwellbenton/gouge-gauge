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
