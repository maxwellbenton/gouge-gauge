import { useState } from 'react'
import { createPriceEntry, type Product } from '../lib/db'
import { PriceComparison } from './PriceComparison'
import { StorePicker } from './StorePicker'
import formStyles from './Form.module.css'

export function PriceEntryForm({
  product,
  onSaved,
  onCancel,
}: {
  product: Product
  onSaved: (storeId: number, price: number) => void
  onCancel: () => void
}) {
  const [storeId, setStoreId] = useState<number | null>(null)
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedPrice = Number(price)
    if (!storeId) {
      setError('Pick a store first.')
      return
    }
    if (!price || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Enter a valid price.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await createPriceEntry({
        productId: product.id,
        storeId,
        price: parsedPrice,
        isSale: false,
        source: 'manual',
      })
      onSaved(storeId, parsedPrice)
    } catch (err) {
      // Without this, a failed save (IndexedDB error, quota, whatever) left
      // the user staring at a form that silently reverted from "Saving…"
      // back to "Save price" with no explanation — found while chasing down
      // an e2e failure where the same thing was suspected.
      console.error('Failed to save price entry', err)
      setError('Could not save this price. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className={formStyles.hint}>
        {product.name}
        {product.brand ? ` — ${product.brand}` : ''}
        {product.sizeValue ? ` (${product.sizeValue} ${product.sizeUnit ?? ''})` : ''}
      </p>
      <PriceComparison product={product} highlightStoreId={storeId} />
      <StorePicker value={storeId} onChange={setStoreId} />
      <div className={formStyles.field}>
        <label htmlFor="price-input">Price</label>
        <input
          id="price-input"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 67.00"
        />
      </div>
      {error && <p className={formStyles.error}>{error}</p>}
      <div className={formStyles.row}>
        <button type="button" className={formStyles.buttonSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={formStyles.button} disabled={saving}>
          {saving ? 'Saving…' : 'Save price'}
        </button>
      </div>
    </form>
  )
}
