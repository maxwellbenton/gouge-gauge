import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppShell } from '../components/AppShell'
import { PriceComparison } from '../components/PriceComparison'
import { effectivePrice, listProductsWithBestPrice, type Product } from '../lib/db'
import formStyles from '../components/Form.module.css'
import styles from './ComparePage.module.css'

export function ComparePage() {
  const summaries = useLiveQuery(() => listProductsWithBestPrice(), [])
  const [selected, setSelected] = useState<Product | null>(null)

  if (selected) {
    return (
      <AppShell title="Compare">
        <button type="button" className={formStyles.linkButton} onClick={() => setSelected(null)}>
          ← All products
        </button>
        <h2>{selected.name}</h2>
        {selected.brand && <p className={styles.brand}>{selected.brand}</p>}
        <PriceComparison product={selected} />
      </AppShell>
    )
  }

  return (
    <AppShell title="Compare">
      {summaries !== undefined && summaries.length === 0 && (
        <p className={styles.empty}>Scan a product and log a price to start building comparisons.</p>
      )}

      {summaries !== undefined && summaries.length > 0 && (
        <ul className={styles.list}>
          {summaries.map(({ product, storeCount, bestEntry }) => (
            <li key={product.id}>
              <button type="button" className={styles.item} onClick={() => setSelected(product)}>
                <div className={styles.itemMain}>
                  <div className={styles.itemName}>{product.name}</div>
                  <div className={styles.itemMeta}>
                    {storeCount === 0
                      ? 'No prices logged yet'
                      : `${storeCount} ${storeCount === 1 ? 'store' : 'stores'}${bestEntry ? ` · best at ${bestEntry.store.name}` : ''}`}
                  </div>
                </div>
                {bestEntry && (
                  <div className={styles.itemPrice}>${effectivePrice(bestEntry).toFixed(2)}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  )
}
