import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createStore } from '../lib/db'
import formStyles from './Form.module.css'

export function StorePicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (storeId: number) => void
}) {
  const stores = useLiveQuery(() => db.stores.orderBy('lastUsedAt').reverse().toArray(), [])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const id = await createStore({ name })
      onChange(id)
      setNewName('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <form onSubmit={handleAddStore}>
        <div className={formStyles.field}>
          <label htmlFor="new-store-name">New store name</label>
          <input
            id="new-store-name"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Tractor Supply"
          />
        </div>
        <div className={formStyles.row}>
          <button
            type="button"
            className={formStyles.buttonSecondary}
            onClick={() => {
              setAdding(false)
              setNewName('')
            }}
          >
            Cancel
          </button>
          <button type="submit" className={formStyles.button} disabled={!newName.trim() || saving}>
            {saving ? 'Adding…' : 'Add store'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className={formStyles.field}>
      <label htmlFor="store-select">Store</label>
      <select
        id="store-select"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value="" disabled>
          {stores === undefined ? 'Loading…' : 'Select a store'}
        </option>
        {stores?.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <button type="button" className={formStyles.linkButton} onClick={() => setAdding(true)}>
        + Add a new store
      </button>
    </div>
  )
}
