import { useState } from 'react'
import { createProduct, SIZE_UNITS, type Product, type SizeUnit } from '../lib/db'
import formStyles from './Form.module.css'

export function NewProductForm({
  barcode,
  onCreated,
  onCancel,
}: {
  barcode: string
  onCreated: (product: Product) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [sizeValue, setSizeValue] = useState('')
  const [sizeUnit, setSizeUnit] = useState<SizeUnit | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setError(null)
    setSaving(true)
    try {
      const id = await createProduct({
        barcode,
        name: trimmedName,
        brand: brand.trim() || undefined,
        sizeValue: sizeValue ? Number(sizeValue) : undefined,
        sizeUnit: sizeUnit || undefined,
      })
      onCreated({
        id,
        barcode,
        name: trimmedName,
        brand: brand.trim() || undefined,
        sizeValue: sizeValue ? Number(sizeValue) : undefined,
        sizeUnit: sizeUnit || undefined,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error('Failed to save product', err)
      setError('Could not save this product. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className={formStyles.hint}>
        Barcode {barcode} hasn't been logged before. What product is this?
      </p>
      <div className={formStyles.field}>
        <label htmlFor="product-name">Product name</label>
        <input
          id="product-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Blue Buffalo Chicken Dog Food"
        />
      </div>
      <div className={formStyles.field}>
        <label htmlFor="product-brand">Brand (optional)</label>
        <input
          id="product-brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Blue Buffalo"
        />
      </div>
      <div className={formStyles.row}>
        <div className={formStyles.field}>
          <label htmlFor="product-size-value">Size (optional)</label>
          <input
            id="product-size-value"
            inputMode="decimal"
            value={sizeValue}
            onChange={(e) => setSizeValue(e.target.value)}
            placeholder="e.g. 24"
          />
        </div>
        <div className={formStyles.field}>
          <label htmlFor="product-size-unit">Unit</label>
          <select
            id="product-size-unit"
            value={sizeUnit}
            onChange={(e) => setSizeUnit(e.target.value as SizeUnit | '')}
          >
            <option value="">—</option>
            {SIZE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={formStyles.hint}>
        Size helps compare price-per-unit across stores later — worth adding if you have it handy.
      </p>
      {error && <p className={formStyles.error}>{error}</p>}
      <div className={formStyles.row}>
        <button type="button" className={formStyles.buttonSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={formStyles.button} disabled={!name.trim() || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  )
}
