import { useRef, useState } from 'react'
import { createPriceEntry, type Product } from '../lib/db'
import { PriceComparison } from './PriceComparison'
import { StorePicker } from './StorePicker'
import formStyles from './Form.module.css'
import type { PriceCandidate } from '../lib/priceOcr'

type OcrStatus =
  | { state: 'idle' }
  | { state: 'reading' }
  | { state: 'found'; candidates: PriceCandidate[] }
  | { state: 'not-found' }
  | { state: 'error' }

export function PriceEntryForm({
  product,
  onSaved,
  onCancel,
}: {
  product: Product
  onSaved: (storeId: number, price: number, opts?: { bulkQty?: number }) => void
  onCancel: () => void
}) {
  const [storeId, setStoreId] = useState<number | null>(null)
  const [price, setPrice] = useState('')
  const [isBulk, setIsBulk] = useState(false)
  const [bulkQty, setBulkQty] = useState('')
  const [isSale, setIsSale] = useState(false)
  const [saleEndsAt, setSaleEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>({ state: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parsedBulkQtyPreview = Number(bulkQty)
  const parsedPricePreview = Number(price)
  const showBulkPreview =
    isBulk &&
    bulkQty &&
    price &&
    Number.isInteger(parsedBulkQtyPreview) &&
    parsedBulkQtyPreview > 0 &&
    !Number.isNaN(parsedPricePreview)

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
    let parsedBulkQty: number | undefined
    if (isBulk) {
      parsedBulkQty = Number(bulkQty)
      if (!bulkQty || !Number.isInteger(parsedBulkQty) || parsedBulkQty < 2) {
        setError('Enter how many items are included in the deal (2 or more).')
        return
      }
    }
    let parsedSaleEndsAt: number | undefined
    if (isSale && saleEndsAt) {
      // End of the selected day, so a sale is still considered active for
      // its whole last day rather than expiring at midnight.
      const parsed = new Date(`${saleEndsAt}T23:59:59`).getTime()
      if (Number.isNaN(parsed)) {
        setError("That sale end date doesn't look right.")
        return
      }
      parsedSaleEndsAt = parsed
    }
    setError(null)
    setSaving(true)
    try {
      await createPriceEntry({
        productId: product.id,
        storeId,
        price: parsedPrice,
        isSale,
        saleEndsAt: parsedSaleEndsAt,
        bulkQty: parsedBulkQty,
        source: 'manual',
      })
      onSaved(storeId, parsedPrice, { bulkQty: parsedBulkQty })
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

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again (e.g. after a "not found" retry
    // with the same photo) still fires onChange.
    e.target.value = ''
    if (!file) return

    setOcrStatus({ state: 'reading' })
    try {
      const { recognizePriceFromImage } = await import('../lib/priceOcr')
      const { candidates } = await recognizePriceFromImage(file)
      if (candidates.length === 0) {
        setOcrStatus({ state: 'not-found' })
      } else {
        setOcrStatus({ state: 'found', candidates })
        // Prefill with the first candidate, but the user must still hit
        // "Save price" — this never auto-submits (docs/DESIGN.md §5).
        setPrice(String(candidates[0].value))
      }
    } catch (err) {
      console.error('OCR failed', err)
      setOcrStatus({ state: 'error' })
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

      <div className={formStyles.checkboxRow}>
        <label>
          <input type="checkbox" checked={isBulk} onChange={(e) => setIsBulk(e.target.checked)} />
          Bulk deal (e.g. "3 for $10")
        </label>
      </div>
      {isBulk && (
        <div className={formStyles.field}>
          <label htmlFor="bulk-qty">Quantity included</label>
          <input
            id="bulk-qty"
            inputMode="numeric"
            value={bulkQty}
            onChange={(e) => setBulkQty(e.target.value)}
            placeholder="e.g. 3"
          />
        </div>
      )}

      <div className={formStyles.ocrRow}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handlePhotoSelected(e)}
          className={formStyles.hiddenFileInput}
          aria-label="Scan price from a photo"
        />
        <button
          type="button"
          className={formStyles.linkButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={ocrStatus.state === 'reading'}
        >
          {ocrStatus.state === 'reading' ? 'Reading photo…' : 'Scan price from a photo (beta)'}
        </button>
        {ocrStatus.state === 'not-found' && (
          <p className={formStyles.ocrStatus}>Couldn't find a price in that photo — enter it below.</p>
        )}
        {ocrStatus.state === 'error' && (
          <p className={formStyles.ocrStatus}>Couldn't read that photo — enter the price below.</p>
        )}
        {ocrStatus.state === 'found' && ocrStatus.candidates.length > 1 && (
          <>
            <p className={formStyles.ocrStatus}>Found more than one price — tap the right one:</p>
            <div className={formStyles.ocrCandidates}>
              {ocrStatus.candidates.map((candidate) => (
                <button
                  key={candidate.value}
                  type="button"
                  className={formStyles.ocrChip}
                  onClick={() => setPrice(String(candidate.value))}
                >
                  {candidate.raw}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className={formStyles.field}>
        <label htmlFor="price-input">{isBulk ? 'Total price for the deal' : 'Price'}</label>
        <input
          id="price-input"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={isBulk ? 'e.g. 10.00' : 'e.g. 67.00'}
        />
        {showBulkPreview && (
          <p className={formStyles.inlinePreview}>
            = ${(parsedPricePreview / parsedBulkQtyPreview).toFixed(2)} each
          </p>
        )}
      </div>

      <div className={formStyles.checkboxRow}>
        <label>
          <input type="checkbox" checked={isSale} onChange={(e) => setIsSale(e.target.checked)} />
          This is a sale price
        </label>
      </div>
      {isSale && (
        <div className={formStyles.field}>
          <label htmlFor="sale-ends-at">Sale ends (optional)</label>
          <input
            id="sale-ends-at"
            type="date"
            value={saleEndsAt}
            onChange={(e) => setSaleEndsAt(e.target.value)}
          />
        </div>
      )}

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
