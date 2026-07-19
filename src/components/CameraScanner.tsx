import { useEffect, useState } from 'react'
import { useBarcodeScanner } from '../lib/useBarcodeScanner'
import styles from './CameraScanner.module.css'
import formStyles from './Form.module.css'

export function CameraScanner({ onDetect }: { onDetect: (barcode: string) => void }) {
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const scanner = useBarcodeScanner(onDetect)

  useEffect(() => {
    if (manualMode) {
      scanner.stop()
      return
    }
    scanner.start()
    return () => scanner.stop()
    // scanner.start/stop are stable (useCallback with no deps); re-run only
    // when the user flips manual/camera mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualValue.trim()
    if (!code) return
    setManualValue('')
    onDetect(code)
  }

  return (
    <div>
      {!manualMode && (
        <div className={styles.viewport}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={scanner.videoRef} className={styles.video} muted playsInline />
          <div className={styles.frame} />
          <div className={styles.status}>
            {scanner.status === 'starting' && 'Starting camera…'}
            {scanner.status === 'scanning' && 'Point the camera at a barcode'}
            {scanner.status === 'error' && (scanner.error ?? 'Camera unavailable')}
          </div>
        </div>
      )}

      <div className={styles.toggleRow}>
        <button
          type="button"
          className={formStyles.linkButton}
          onClick={() => setManualMode((m) => !m)}
        >
          {manualMode ? 'Use camera instead' : 'Enter barcode manually'}
        </button>
      </div>

      {manualMode && (
        <form onSubmit={handleManualSubmit}>
          <div className={formStyles.field}>
            <label htmlFor="manual-barcode">Barcode number</label>
            <input
              id="manual-barcode"
              inputMode="numeric"
              autoFocus
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="e.g. 040232013408"
            />
          </div>
          <button type="submit" className={formStyles.button} disabled={!manualValue.trim()}>
            Look up price
          </button>
        </form>
      )}
    </div>
  )
}
