import { useState } from 'react'
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
  | { kind: 'saved'; product: Product; storeName: string; price: number }

export function ScanPage() {
  const [step, setStep] = useState<Step>({ kind: 'scanning' })

  const handleDetected = async (barcode: string) => {
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

  const handlePriceSaved = async (storeId: number, price: number) => {
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
    setStep({ kind: 'saved', product, storeName, price })
  }

  const reset = () => setStep({ kind: 'scanning' })

  return (
    <AppShell title="Scan">
      {step.kind === 'scanning' && (
        <>
          <CameraScanner onDetect={handleDetected} />
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
          <button type="button" className={formStyles.button} onClick={reset}>
            Scan another
          </button>
        </div>
      )}
    </AppShell>
  )
}
