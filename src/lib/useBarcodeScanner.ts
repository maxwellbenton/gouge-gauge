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
  // while that's still in flight, the awaits inside `start()` were still
  // resolving *after* stop() had already run, with nothing to check
  // against. This token lets any part of `start()` — including its decode
  // callback — recognize it's been superseded by a later stop()/start().
  //
  // The decode callback specifically turned out to matter most: React
  // StrictMode double-invokes effects in dev (mount → cleanup → mount
  // again), so *every* mount actually calls `start()` twice against the
  // same <video> element — a "phantom" call that gets stopped almost
  // immediately, and the real one that survives. Confirmed via the
  // logging below: the phantom's own `decodeFromConstraints` callback can
  // still fire a real decode result *before* its own outer `await`
  // resolves (ZXing appears to start its internal scan loop, and can
  // report a match, before the promise wrapping it settles) — meaning the
  // post-negotiation "was I superseded?" check below runs too late to
  // stop a phantom scanner from already having called onDetect. With the
  // fake-camera fixture (which shows a valid, decodable barcode from
  // frame one), that phantom detection was firing on effectively every
  // mount — it just didn't matter for flows with only one scan/detect
  // cycle. The fix has to be *inside* the callback, not just after the
  // await: check the token before acting on a result, not only before
  // installing `controls`.
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
            // Always stop this specific scan loop on a match, live or not —
            // no reason to keep decoding frames either way.
            activeControls.stop()
            if (startId !== startIdRef.current) {
              // This is a superseded (often StrictMode-phantom) scanner
              // that found a match before it got torn down. It is not the
              // scanner backing what's on screen right now — acting on
              // this would fire onDetect (and drive step transitions)
              // behind whatever UI actually replaced the camera view.
              log(
                `decode callback for superseded start() id ${startId} (current token ${startIdRef.current}) — discarding the detection`,
              )
              return
            }
            log(`decode callback fired a live result for start() id ${startId}`)
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
