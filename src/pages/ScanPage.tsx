import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { CameraScanner } from '../components/CameraScanner'
import { NewProductForm } from '../components/NewProductForm'
import { PriceEntryForm } from '../components/PriceEntryForm'
import { RecentCaptures } from '../components/RecentCaptures'
import { db, getProductByBarcode, type Product } from '../lib/db'
import formStyles from '../components/Form.module.css'
import styles from './Placeholder.module.css'

type Step =
  | { kind: 'scanning' }
  | { kind: 'need-product'; barcode: string }
  | { kind: 'price-entry'; product: Product }
  | { kind: 'saved'; product: Product; storeName: string; price: number; bulkQty?: number }

export function ScanPage() {
  const [step, setStep] = useState<Step>({ kind: 'scanning' })

  const handleDetected = async (barcode: string) => {
    console.debug(`[ScanPage] handleDetected(${barcode}) — current step was ${step.kind}`)
    const existing = await getProductByBarcode(barcode)
    if (existing) {
      setStep({ kind: 'price-entry', product: existing })
    } else {
      setStep({ kind: 'need-product', barcode })
    }
  }

  const handleProductCreated = (product: Product) => {
    setStep({ kind: 'price-entry', product })
  }

  const handlePriceSaved = async (
    storeId: number,
    price: number,
    opts?: { bulkQty?: number },
  ) => {
    if (step.kind !== 'price-entry') return
    const product = step.product
    // The price entry is already committed by this point — this lookup is
    // just for a friendlier confirmation message, so a failure here
    // shouldn't leave the user stuck on the price form after a save that
    // actually succeeded.
    let storeName = 'store'
    try {
      const store = await db.stores.get(storeId)
      if (store) storeName = store.name
    } catch (err) {
      console.error('Saved the price entry, but failed to look up the store name', err)
    }
    setStep({ kind: 'saved', product, storeName, price, bulkQty: opts?.bulkQty })
  }

  const reset = () => setStep({ kind: 'scanning' })

  return (
    <AppShell title="Scan">
      {step.kind === 'scanning' && (
        <>
          <CameraScanner onDetect={handleDetected} />
          <Link to="/import" className={formStyles.linkButton}>
            Shopping online instead? Import from a screenshot
          </Link>
          <h2>Recent captures</h2>
          <RecentCaptures />
        </>
      )}

      {step.kind === 'need-product' && (
        <div className={styles.card}>
          <NewProductForm
            barcode={step.barcode}
            onCreated={handleProductCreated}
            onCancel={reset}
          />
        </div>
      )}

      {step.kind === 'price-entry' && (
        <div className={styles.card}>
          <PriceEntryForm product={step.product} onSaved={handlePriceSaved} onCancel={reset} />
        </div>
      )}

      {step.kind === 'saved' && (
        <div className={styles.card}>
          <h2>Saved</h2>
          <p>
            {step.product.name} — ${step.price.toFixed(2)} at {step.storeName}
          </p>
          {step.bulkQty && (
            <p className={formStyles.hint}>
              {step.bulkQty} for ${step.price.toFixed(2)} — ${(step.price / step.bulkQty).toFixed(2)} each
            </p>
          )}
          <button type="button" className={formStyles.button} onClick={reset}>
            Scan another
          </button>
        </div>
      )}
    </AppShell>
  )
}
