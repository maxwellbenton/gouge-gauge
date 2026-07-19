import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppShell } from '../components/AppShell'
import { ShoppingListDetail } from '../components/ShoppingListDetail'
import { createShoppingList, listShoppingListsWithCounts } from '../lib/db'
import formStyles from '../components/Form.module.css'
import styles from './ListsPage.module.css'

export function ListsPage() {
  const lists = useLiveQuery(() => listShoppingListsWithCounts(), [])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  if (selectedListId !== null) {
    return <ShoppingListDetail listId={selectedListId} onBack={() => setSelectedListId(null)} />
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    setCreating(true)
    try {
      const id = await createShoppingList(name)
      setNewListName('')
      setSelectedListId(id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell title="Lists">
      {lists !== undefined && lists.length === 0 && (
        <p className={styles.empty}>
          No lists yet — build one from products you've already priced, like "dog supplies".
        </p>
      )}

      {lists !== undefined && lists.length > 0 && (
        <ul className={styles.list}>
          {lists.map((list) => (
            <li key={list.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => setSelectedListId(list.id)}
              >
                <div className={styles.itemName}>{list.name}</div>
                <div className={styles.itemMeta}>
                  {list.itemCount === 0
                    ? 'No items yet'
                    : `${list.purchasedCount}/${list.itemCount} bought`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>New list</h2>
      <form onSubmit={handleCreate}>
        <div className={formStyles.field}>
          <label htmlFor="list-name">Name</label>
          <input
            id="list-name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="e.g. Dog supplies"
          />
        </div>
        <button type="submit" className={formStyles.button} disabled={!newListName.trim() || creating}>
          {creating ? 'Creating…' : 'Create list'}
        </button>
      </form>
    </AppShell>
  )
}
