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

// Temporary-but-cheap lifecycle logging while chasing a scan/detect race
// that survived one targeted fix already (see the startIdRef comment
// below). console.debug rather than .error/.log so it doesn't read as an
// actual problem; e2e/test-fixtures.ts forwards every console level to the
// Playwright test output so this shows up there without attaching a
// debugger.
const log = (msg: string) => console.debug(`[scanner] ${msg}`)

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

  // `start()` does real async work (dynamic import + getUserMedia
  // negotiation) before it has anything to stop. If `stop()` is called
  // while that's still in flight — e.g. the user flips to manual entry
  // right after the camera view mounts — the awaits inside `start()` were
  // still resolving *after* stop() had already run, and had nothing to
  // check against: it would happily install fresh `controls` and flip
  // back to "scanning" as if stop() had never happened, leaving a live
  // decode loop running behind whatever UI replaced the camera view. With
  // a fixed fake-camera fixture in e2e tests that loop keeps feeding the
  // same already-known barcode, so it would eventually fire onDetect and
  // yank the app out from under whatever the user (or test) was doing —
  // manual entry's "Look up price" button, for instance, would get
  // unmounted mid-click. This token invalidates any start() that was
  // superseded by a stop() before it finished negotiating.
  const startIdRef = useRef(0)

  const stop = useCallback(() => {
    startIdRef.current += 1
    log(`stop() called — token now ${startIdRef.current}, had live controls: ${!!controlsRef.current}`)
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (!videoRef.current) return
    setError(null)
    setStatus('starting')
    const startId = (startIdRef.current += 1)
    log(`start() called — assigned id ${startId}`)
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
            log(
              `decode callback fired a result for start() id ${startId} — ` +
                `is it still the live scanner? current token=${startIdRef.current}, ` +
                `controlsRef.current is these controls: ${controlsRef.current === activeControls}`,
            )
            activeControls.stop()
            controlsRef.current = null
            setStatus('idle')
            onDetectRef.current(result.getText())
          }
          // Any decode error here just means "no barcode in frame this tick" —
          // that fires continuously during normal scanning, so it's ignored.
        },
      )
      log(`start() id ${startId} finished negotiating — current token is ${startIdRef.current}`)
      if (startId !== startIdRef.current) {
        // Superseded by a stop() (or another start()) while we were still
        // negotiating the camera — discard these controls immediately
        // instead of silently re-arming a scanner nobody asked for.
        log(`start() id ${startId} was superseded — stopping the discarded controls`)
        controls.stop()
        return
      }
      controlsRef.current = controls
      setStatus('scanning')
    } catch (err) {
      if (startId !== startIdRef.current) return
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : 'Could not access the camera. Check camera permissions or enter the barcode manually.',
      )
    }
  }, [])

  useEffect(() => {
    return () => stop()
    // stop() is stable (useCallback with no deps) — this just guarantees
    // the scanner (and any in-flight start()) is torn down on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { videoRef, status, error, start, stop }
}
