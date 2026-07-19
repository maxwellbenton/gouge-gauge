import { AppShell } from '../components/AppShell'
import styles from './Placeholder.module.css'

export function ListsPage() {
  return (
    <AppShell title="Lists">
      <div className={styles.card}>
        <span className={styles.milestone}>M4</span>
        <p>
          Shopping lists built from products with price history, grouped by
          the cheapest store by default, with every item still editable —
          reassign a store or mark something purchased regardless of where it
          was actually bought.
        </p>
        <p>Not built yet — this screen is a placeholder from M0 scaffolding.</p>
      </div>
    </AppShell>
  )
}
