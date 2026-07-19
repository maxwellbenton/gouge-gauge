import { AppShell } from '../components/AppShell'
import styles from './Placeholder.module.css'

export function ComparePage() {
  return (
    <AppShell title="Compare">
      <div className={styles.card}>
        <span className={styles.milestone}>M2</span>
        <p>
          Scan a product you've already logged and this screen will rank every
          known price for it across stores, unit price first, current store
          highlighted.
        </p>
        <p>Not built yet — this screen is a placeholder from M0 scaffolding.</p>
      </div>
    </AppShell>
  )
}
