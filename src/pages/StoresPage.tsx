import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppShell } from '../components/AppShell'
import { createStore, listStoresWithCounts } from '../lib/db'
import formStyles from '../components/Form.module.css'
import styles from './StoresPage.module.css'

export function StoresPage() {
  const stores = useLiveQuery(() => listStoresWithCounts(), [])
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setSaving(true)
    try {
      await createStore({ name: trimmedName, location: location.trim() || undefined })
      setName('')
      setLocation('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title="Stores">
      {stores !== undefined && stores.length === 0 && (
        <p className={styles.empty}>No stores yet — add the ones you shop at below.</p>
      )}

      {stores !== undefined && stores.length > 0 && (
        <ul className={styles.list}>
          {stores.map((store) => (
            <li key={store.id} className={styles.item}>
              <div>
                <div className={styles.itemName}>{store.name}</div>
                {store.location && <div className={styles.itemLocation}>{store.location}</div>}
              </div>
              <div className={styles.itemCount}>
                {store.priceEntryCount} {store.priceEntryCount === 1 ? 'price' : 'prices'} logged
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Add a store</h2>
      <form onSubmit={handleSubmit}>
        <div className={formStyles.field}>
          <label htmlFor="store-name">Name</label>
          <input
            id="store-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tractor Supply"
          />
        </div>
        <div className={formStyles.field}>
          <label htmlFor="store-location">Location (optional)</label>
          <input
            id="store-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Main St"
          />
        </div>
        <button type="submit" className={formStyles.button} disabled={!name.trim() || saving}>
          {saving ? 'Adding…' : 'Add store'}
        </button>
      </form>
    </AppShell>
  )
}
