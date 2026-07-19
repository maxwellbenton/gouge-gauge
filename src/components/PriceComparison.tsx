import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  SIZE_UNITS,
  listLatestPriceEntriesForProduct,
  updateProductSize,
  type Product,
  type SizeUnit,
} from '../lib/db'
import { computeUnitPrice } from '../lib/unitPrice'
import { formatRelativeTime } from '../lib/formatRelativeTime'
import formStyles from './Form.module.css'
import styles from './PriceComparison.module.css'

/**
 * Ranked list of the latest known price per store for a product. Used both
 * on the Scan page (so a known barcode "immediately" surfaces whether a
 * cheaper store already exists) and on the Compare tab's product detail
 * view.
 */
export function PriceComparison({
  product,
  highlightStoreId = null,
}: {
  product: Product
  highlightStoreId?: number | null
}) {
  const entries = useLiveQuery(() => listLatestPriceEntriesForProduct(product.id), [product.id])

  const [sizeValue, setSizeValue] = useState('')
  const [sizeUnit, setSizeUnit] = useState<SizeUnit | ''>('')
  const [savingSize, setSavingSize] = useState(false)

  if (entries === undefined) return null

  if (entries.length === 0) {
    return <p className={styles.empty}>No prices logged yet for this product — you'll be first.</p>
  }

  // `entries` is re-fetched (and re-joined with a fresh Product row) by
  // useLiveQuery on every relevant Dexie change, including a size saved via
  // the prompt below — but the `product` prop is a snapshot handed down by
  // whoever rendered this component and doesn't update on its own. Once
  // there's at least one entry, prefer the copy that came back with it so a
  // same-session size edit is reflected immediately instead of requiring a
  // remount.
  const currentProduct = entries[0].product

  const ranked = entries
    .map((entry) => ({ entry, unitPrice: computeUnitPrice(entry.price, currentProduct) }))
    .sort((a, b) => (a.unitPrice?.value ?? a.entry.price) - (b.unitPrice?.value ?? b.entry.price))

  const cheapestPrice = ranked[0].entry.price
  const showCheapestBadge = ranked.some((r) => r.entry.price !== cheapestPrice)

  const handleAddSize = async () => {
    const value = Number(sizeValue)
    if (!sizeValue || Number.isNaN(value) || value <= 0 || !sizeUnit) return
    setSavingSize(true)
    try {
      await updateProductSize(product.id, value, sizeUnit)
    } finally {
      setSavingSize(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.heading}>
        {ranked.length === 1 ? 'Only price on file' : `Known prices — ${ranked.length} stores`}
      </h3>
      <ul className={styles.list}>
        {ranked.map(({ entry, unitPrice }, i) => (
          <li
            key={entry.id}
            className={
              entry.storeId === highlightStoreId
                ? `${styles.item} ${styles.itemHighlighted}`
                : styles.item
            }
          >
            <div className={styles.itemMain}>
              <div className={styles.itemName}>
                {entry.store.name}
                {i === 0 && showCheapestBadge && <span className={styles.badge}>Cheapest</span>}
              </div>
              <div className={styles.itemMeta}>{formatRelativeTime(entry.capturedAt)}</div>
            </div>
            <div className={styles.itemPriceWrap}>
              <div className={styles.itemPrice}>${entry.price.toFixed(2)}</div>
              {unitPrice && <div className={styles.itemUnitPrice}>{unitPrice.label}</div>}
            </div>
          </li>
        ))}
      </ul>

      {!currentProduct.sizeValue && (
        <div className={styles.sizePrompt}>
          <p className={formStyles.hint}>Add a size to compare price-per-unit across stores.</p>
          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="compare-size-value">Size</label>
              <input
                id="compare-size-value"
                inputMode="decimal"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
                placeholder="e.g. 24"
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="compare-size-unit">Unit</label>
              <select
                id="compare-size-unit"
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value as SizeUnit | '')}
              >
                <option value="">—</option>
                {SIZE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className={formStyles.linkButton}
            disabled={!sizeValue.trim() || !sizeUnit || savingSize}
            onClick={() => void handleAddSize()}
          >
            {savingSize ? 'Saving…' : 'Save size'}
          </button>
        </div>
      )}
    </div>
  )
}
