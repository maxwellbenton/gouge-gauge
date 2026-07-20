import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AppShell } from '../components/AppShell'
import { PriceEntryForm } from '../components/PriceEntryForm'
import { createImportedProduct, db, SIZE_UNITS, type Product, type SizeUnit } from '../lib/db'
import type { PriceCandidate } from '../lib/priceOcr'
import formStyles from '../components/Form.module.css'
import styles from './Placeholder.module.css'
import importStyles from './ImportScreenshotPage.module.css'

type Phase = 'upload' | 'reading' | 'review' | 'price-entry' | 'saved'

// M5.5: import a product from a screenshot of an online shopping site
// (product page, cart view) instead of scanning a barcode. There's no
// barcode to key off of here, so OCR has to surface both a likely product
// name *and* a price, and the user picks/edits both before anything is
// created — same "OCR only ever prefills" rule as M5's shelf-tag flow
// (docs/DESIGN.md §5).
export function ImportScreenshotPage() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [errorMessage, setErrorMessage] = useState('')

  const [nameCandidates, setNameCandidates] = useState<string[]>([])
  const [priceCandidates, setPriceCandidates] = useState<PriceCandidate[]>([])
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [sizeValue, setSizeValue] = useState('')
  const [sizeUnit, setSizeUnit] = useState<SizeUnit | ''>('')
  const [priceValue, setPriceValue] = useState('')
  const [creating, setCreating] = useState(false)

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [saved, setSaved] = useState<{
    product: Product
    storeName: string
    price: number
    bulkQty?: number
  } | null>(null)

  // Matching by name (not barcode — there isn't one here) against products
  // already on file, so re-importing something already logged doesn't
  // create a duplicate. Local substring filter over the full product list,
  // same "components query db.* directly" convention used elsewhere.
  const allProducts = useLiveQuery(() => db.products.orderBy('name').toArray(), [])
  const trimmedName = name.trim()
  const matches =
    trimmedName.length >= 2 && allProducts
      ? allProducts.filter((p) => p.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 5)
      : []

  const reset = () => {
    setPhase('upload')
    setErrorMessage('')
    setNameCandidates([])
    setPriceCandidates([])
    setName('')
    setBrand('')
    setSizeValue('')
    setSizeUnit('')
    setPriceValue('')
    setSelectedProduct(null)
    setSaved(null)
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhase('reading')
    try {
      const { recognizeScreenshot } = await import('../lib/priceOcr')
      const result = await recognizeScreenshot(file)
      setNameCandidates(result.nameCandidates)
      setPriceCandidates(result.priceCandidates)
      setName(result.nameCandidates[0] ?? '')
      setPriceValue(result.priceCandidates[0] ? String(result.priceCandidates[0].value) : '')
      setPhase('review')
    } catch (err) {
      // Same graceful-degradation principle as M5: a failed/empty OCR pass
      // still lands the user on a normal, fillable-by-hand form rather than
      // a dead end.
      console.error('Screenshot OCR failed', err)
      setErrorMessage("Couldn't read that screenshot — you can still enter the product by hand.")
      setNameCandidates([])
      setPriceCandidates([])
      setPhase('review')
    }
  }

  const handleUseExisting = (product: Product) => {
    setSelectedProduct(product)
    setPhase('price-entry')
  }

  const handleCreateAndContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmedName) return
    setCreating(true)
    try {
      const product = await createImportedProduct({
        name: trimmedName,
        brand: brand.trim() || undefined,
        sizeValue: sizeValue ? Number(sizeValue) : undefined,
        sizeUnit: sizeUnit || undefined,
      })
      setSelectedProduct(product)
      setPhase('price-entry')
    } catch (err) {
      console.error('Failed to save product', err)
      setErrorMessage('Could not save this product. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handlePriceSaved = async (storeId: number, price: number, opts?: { bulkQty?: number }) => {
    if (!selectedProduct) return
    let storeName = 'store'
    try {
      const store = await db.stores.get(storeId)
      if (store) storeName = store.name
    } catch (err) {
      console.error('Saved the price entry, but failed to look up the store name', err)
    }
    setSaved({ product: selectedProduct, storeName, price, bulkQty: opts?.bulkQty })
    setPhase('saved')
  }

  const initialPriceValue =
    priceValue && !Number.isNaN(Number(priceValue)) ? Number(priceValue) : undefined

  return (
    <AppShell title="Import">
      <Link to="/" className={formStyles.linkButton}>
        ← Back to Scan
      </Link>

      {phase === 'upload' && (
        <div className={styles.card}>
          <p className={formStyles.hint}>
            Upload a screenshot from an online shopping site — a product page or cart view. No
            barcode needed; OCR pulls out a likely product name and price for you to confirm.
          </p>
          <div className={formStyles.field}>
            <label htmlFor="screenshot-file">Screenshot</label>
            <input
              id="screenshot-file"
              type="file"
              accept="image/*"
              onChange={(e) => void handleFileSelected(e)}
            />
          </div>
        </div>
      )}

      {phase === 'reading' && (
        <div className={styles.card}>
          <p>Reading screenshot…</p>
        </div>
      )}

      {phase === 'review' && (
        <div className={styles.card}>
          {errorMessage && <p className={formStyles.error}>{errorMessage}</p>}
          <form onSubmit={handleCreateAndContinue}>
            <div className={formStyles.field}>
              <label htmlFor="import-name">Product name</label>
              <input
                id="import-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blue Buffalo Chicken Dog Food"
              />
            </div>
            {nameCandidates.filter((candidate) => candidate !== name).length > 0 && (
              <div className={formStyles.ocrRow}>
                <p className={formStyles.ocrStatus}>Other lines that might be it:</p>
                <div className={formStyles.ocrCandidates}>
                  {nameCandidates
                    .filter((candidate) => candidate !== name)
                    .map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        className={formStyles.ocrChip}
                        onClick={() => setName(candidate)}
                      >
                        {candidate}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {matches.length > 0 && (
              <div className={formStyles.ocrRow}>
                <p className={formStyles.ocrStatus}>
                  Already logged — use this instead of creating a new one?
                </p>
                <ul className={importStyles.matchList}>
                  {matches.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        className={formStyles.linkButton}
                        onClick={() => handleUseExisting(product)}
                      >
                        {product.name}
                        {product.brand ? ` — ${product.brand}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={formStyles.field}>
              <label htmlFor="import-brand">Brand (optional)</label>
              <input
                id="import-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Blue Buffalo"
              />
            </div>
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <label htmlFor="import-size-value">Size (optional)</label>
                <input
                  id="import-size-value"
                  inputMode="decimal"
                  value={sizeValue}
                  onChange={(e) => setSizeValue(e.target.value)}
                  placeholder="e.g. 24"
                />
              </div>
              <div className={formStyles.field}>
                <label htmlFor="import-size-unit">Unit</label>
                <select
                  id="import-size-unit"
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

            <div className={formStyles.field}>
              <label htmlFor="import-price">Price</label>
              <input
                id="import-price"
                inputMode="decimal"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                placeholder="e.g. 24.99"
              />
            </div>
            {priceCandidates.length > 1 && (
              <div className={formStyles.ocrRow}>
                <p className={formStyles.ocrStatus}>Found more than one price — tap the right one:</p>
                <div className={formStyles.ocrCandidates}>
                  {priceCandidates.map((candidate) => (
                    <button
                      key={candidate.value}
                      type="button"
                      className={formStyles.ocrChip}
                      onClick={() => setPriceValue(String(candidate.value))}
                    >
                      {candidate.raw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={formStyles.row}>
              <button type="button" className={formStyles.buttonSecondary} onClick={reset}>
                Start over
              </button>
              <button type="submit" className={formStyles.button} disabled={!trimmedName || creating}>
                {creating ? 'Saving…' : 'Continue as new product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {phase === 'price-entry' && selectedProduct && (
        <div className={styles.card}>
          <PriceEntryForm
            product={selectedProduct}
            initialPrice={initialPriceValue}
            onSaved={handlePriceSaved}
            onCancel={reset}
          />
        </div>
      )}

      {phase === 'saved' && saved && (
        <div className={styles.card}>
          <h2>Saved</h2>
          <p>
            {saved.product.name} — ${saved.price.toFixed(2)} at {saved.storeName}
          </p>
          {saved.bulkQty && (
            <p className={formStyles.hint}>
              {saved.bulkQty} for ${saved.price.toFixed(2)} — $
              {(saved.price / saved.bulkQty).toFixed(2)} each
            </p>
          )}
          <div className={formStyles.row}>
            <button type="button" className={formStyles.button} onClick={reset}>
              Import another
            </button>
            <Link to="/" className={formStyles.buttonSecondary}>
              Back to Scan
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  )
}
