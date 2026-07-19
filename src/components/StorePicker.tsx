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

  const handleAddStore = async () => {
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
    // Deliberately a <div>, not a nested <form>: StorePicker renders inside
    // PriceEntryForm's own <form>, and a form-within-a-form is invalid
    // HTML — React warns about it, and in practice this form's submit
    // event bubbles up and fires the OUTER form's onSubmit too (with
    // whatever storeId/price it currently has, usually neither set yet).
    // That's what was silently breaking "Save price" until this was found.
    // type="button" + onClick/onKeyDown below stand in for native form
    // submission.
    return (
      <div>
        <div className={formStyles.field}>
          <label htmlFor="new-store-name">New store name</label>
          <input
            id="new-store-name"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAddStore()
              }
            }}
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
          <button
            type="button"
            className={formStyles.button}
            disabled={!newName.trim() || saving}
            onClick={() => void handleAddStore()}
          >
            {saving ? 'Adding…' : 'Add store'}
          </button>
        </div>
      </div>
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
