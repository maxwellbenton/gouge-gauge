import { AppShell } from '../components/AppShell'
import styles from './Placeholder.module.css'

export function ScanPage() {
  return (
    <AppShell title="Scan">
      <div className={styles.card}>
        <span className={styles.milestone}>M1</span>
        <p>
          This is where barcode scanning and price entry will live: point the
          camera at a product, confirm or correct the detected price, and save
          it to the current store.
        </p>
        <p>Not built yet — this screen is a placeholder from M0 scaffolding.</p>
      </div>
    </AppShell>
  )
}
