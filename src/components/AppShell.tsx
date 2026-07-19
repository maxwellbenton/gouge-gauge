import type { ReactNode } from 'react'
import styles from './AppShell.module.css'
import { BottomNav } from './BottomNav'

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>{title}</h1>
      </header>
      <main className={styles.main}>{children}</main>
      <BottomNav />
    </div>
  )
}
