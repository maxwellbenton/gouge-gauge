import { AppShell } from '../components/AppShell'
import styles from './Placeholder.module.css'

export function StoresPage() {
  return (
    <AppShell title="Stores">
      <div className={styles.card}>
        <span className={styles.milestone}>M1</span>
        <p>
          Manage the stores you shop at — add new ones, see recently used
          stores first when logging a price.
        </p>
        <p>Not built yet — this screen is a placeholder from M0 scaffolding.</p>
      </div>
    </AppShell>
  )
}
