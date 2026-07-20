import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addShoppingListItem,
  db,
  deleteShoppingList,
  deleteShoppingListItem,
  listItemsForList,
  setShoppingListItemPurchased,
  setShoppingListItemStore,
  type EnrichedShoppingListItem,
} from '../lib/db'
import { AppShell } from './AppShell'
import formStyles from './Form.module.css'
import styles from './ShoppingListDetail.module.css'

const UNASSIGNED_GROUP = 'No price logged yet'

export function ShoppingListDetail({ listId, onBack }: { listId: number; onBack: () => void }) {
  const list = useLiveQuery(() => db.shoppingLists.get(listId), [listId])
  const items = useLiveQuery(() => listItemsForList(listId), [listId])
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [])
  const stores = useLiveQuery(() => db.stores.orderBy('name').toArray(), [])

  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [adding, setAdding] = useState(false)

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    // Captured now, not read again after the await below — see the reset
    // logic at the end of this function for why.
    const submittedProductId = productId
    const submittedQuantity = quantity
    const parsedProductId = Number(submittedProductId)
    const parsedQuantity = Number(submittedQuantity)
    if (!parsedProductId || !Number.isInteger(parsedQuantity) || parsedQuantity < 1) return
    setAdding(true)
    try {
      await addShoppingListItem({ listId, productId: parsedProductId, quantity: parsedQuantity })
      // Nothing disables the Product/Quantity fields while this save is in
      // flight (only the submit button is disabled), so it's possible to
      // pick the next product before this write resolves — that happens
      // reliably under Playwright's speed, and could happen for a fast
      // human too. Resetting unconditionally here would stomp on whatever
      // the user already chose for their *next* add. Only reset a field if
      // it still holds what was just submitted.
      setProductId((current) => (current === submittedProductId ? '' : current))
      setQuantity((current) => (current === submittedQuantity ? '1' : current))
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteList = async () => {
    await deleteShoppingList(listId)
    onBack()
  }

  if (list === undefined || items === undefined) return null

  // Group by effective store (explicit override, or whichever store is
  // currently cheapest), alphabetical, with "no price yet" pushed last.
  const groups = new Map<string, EnrichedShoppingListItem[]>()
  for (const item of items) {
    const key = item.effectiveStore?.name ?? UNASSIGNED_GROUP
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    if (a === UNASSIGNED_GROUP) return 1
    if (b === UNASSIGNED_GROUP) return -1
    return a.localeCompare(b)
  })

  return (
    <AppShell title="Lists">
      <button type="button" className={formStyles.linkButton} onClick={onBack}>
        ← All lists
      </button>
      <div className={styles.header}>
        <h2 className={styles.heading}>{list.name}</h2>
        <button type="button" className={styles.deleteButton} onClick={() => void handleDeleteList()}>
          Delete list
        </button>
      </div>

      {items.length === 0 && (
        <p className={styles.empty}>No items yet — add something you've already priced below.</p>
      )}

      {groupNames.map((groupName) => (
        <div key={groupName} className={styles.group}>
          <h3 className={styles.groupHeading}>{groupName}</h3>
          <ul className={styles.itemList}>
            {groups.get(groupName)!.map((item) => (
              <li
                key={item.id}
                className={item.purchased ? `${styles.item} ${styles.itemPurchased}` : styles.item}
              >
                <label className={styles.itemCheckLabel}>
                  <input
                    type="checkbox"
                    checked={item.purchased}
                    onChange={(e) =>
                      void setShoppingListItemPurchased(
                        item.id,
                        e.target.checked,
                        item.effectiveStore?.id,
                      )
                    }
                  />
                  <span className={styles.itemName}>
                    {item.product.name}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  </span>
                </label>
                <div className={styles.itemMeta}>
                  {item.effectivePrice !== undefined
                    ? `$${item.effectivePrice.toFixed(2)} each`
                    : 'No price logged yet'}
                </div>
                <div className={styles.itemActions}>
                  <select
                    aria-label={`Store for ${item.product.name}`}
                    value={item.targetStoreId ?? ''}
                    onChange={(e) =>
                      void setShoppingListItemStore(
                        item.id,
                        e.target.value === '' ? undefined : Number(e.target.value),
                      )
                    }
                  >
                    <option value="">Cheapest available</option>
                    {stores?.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={formStyles.linkButton}
                    onClick={() => void deleteShoppingListItem(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Add an item</h2>
      <form onSubmit={handleAddItem}>
        <div className={formStyles.field}>
          <label htmlFor="list-item-product">Product</label>
          <select
            id="list-item-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="" disabled>
              {products === undefined ? 'Loading…' : 'Select a product'}
            </option>
            {products?.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
        <div className={formStyles.field}>
          <label htmlFor="list-item-quantity">Quantity</label>
          <input
            id="list-item-quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <button type="submit" className={formStyles.button} disabled={!productId || adding}>
          {adding ? 'Adding…' : 'Add to list'}
        </button>
      </form>
    </AppShell>
  )
}
