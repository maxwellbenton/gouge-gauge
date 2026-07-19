import { useLiveQuery } from 'dexie-react-hooks'
import { effectivePrice, listRecentPriceEntries } from '../lib/db'
import { formatRelativeTime } from '../lib/formatRelativeTime'
import styles from './RecentCaptures.module.css'

export function RecentCaptures() {
  const entries = useLiveQuery(() => listRecentPriceEntries(10), [])

  if (entries === undefined) return null

  if (entries.length === 0) {
    return <p className={styles.empty}>Nothing scanned yet — your captures will show up here.</p>
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.item}>
          <div className={styles.itemMain}>
            <div className={styles.itemName}>
              {entry.product.name}
              {entry.isSale && <span className={styles.tag}>Sale</span>}
            </div>
            <div className={styles.itemMeta}>
              {entry.store.name} · {formatRelativeTime(entry.capturedAt)}
            </div>
          </div>
          <div className={styles.itemPrice}>
            ${effectivePrice(entry).toFixed(2)}
            {entry.bulkQty ? ' each' : ''}
          </div>
        </li>
      ))}
    </ul>
  )
}
