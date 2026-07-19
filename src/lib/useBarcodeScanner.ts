import { useCallback, useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

// Implementation note: this uses @zxing/browser exclusively (over the native
// BarcodeDetector API) so scanning behaves the same on Safari/iOS as on
// Chrome/Android — BarcodeDetector support is inconsistent across browsers,
// notably on iOS, which is a real constraint for a PWA. Native detection
// could be layered in later as a performance optimization where supported.
//
// @zxing/library is a meaningful chunk of JS (~600kB), so it's dynamically
// imported inside `start()` rather than at module scope — it only loads once
// the user actually opens the scanner, not on every page of the app.

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error'

export function useBarcodeScanner(onDetect: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Keep the latest callback without re-running `start`'s identity every render.
  const onDetectRef = useRef(onDetect)
  useEffect(() => {
    onDetectRef.current = onDetect
  }, [onDetect])

  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!videoRef.current) return
    setError(null)
    setStatus('starting')
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      // Product barcodes only — skips QR/Aztec/PDF417 decoding work we don't
      // need and reduces false positives from unrelated codes in frame.
      const hints = new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
          ],
        ],
      ])
      const reader = new BrowserMultiFormatReader(hints)
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result, _err, activeControls) => {
          if (result) {
            activeControls.stop()
            controlsRef.current = null
            setStatus('idle')
            onDetectRef.current(result.getText())
          }
          // Any decode error here just means "no barcode in frame this tick" —
          // that fires continuously during normal scanning, so it's ignored.
        },
      )
      controlsRef.current = controls
      setStatus('scanning')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : 'Could not access the camera. Check camera permissions or enter the barcode manually.',
      )
    }
  }, [])

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  return { videoRef, status, error, start, stop }
}
