/**
 * OCR-based price extraction from photos (shelf tags, price stickers).
 *
 * tesseract.js is dynamically imported so it never lands in the main
 * bundle — same code-splitting pattern used for @zxing/browser in
 * useBarcodeScanner.ts. This is a spike-grade helper: it recognizes plain
 * text and regexes prices out of it, deliberately skipping tesseract's
 * word-level bounding-box output (`output: { blocks: true }`) since the
 * text-only path was accurate enough on the synthetic fixtures in
 * scripts/ocr-spike.ts (see docs/OCR-SPIKE.md for the writeup).
 *
 * Per docs/DESIGN.md §5, this NEVER auto-fills or auto-submits a price on
 * its own — callers must always let the user confirm/edit the result.
 */

export interface PriceCandidate {
  /** The exact substring matched, e.g. "$12.99" — shown to the user as-is. */
  raw: string
  value: number
}

const DOLLAR_PRICE = /\$\s?(\d{1,4}(?:\.\d{2})?)/g
const BARE_DECIMAL_PRICE = /\b(\d{1,4}\.\d{2})\b/g

/**
 * Pulls plausible price values out of raw OCR text. Prefers explicit
 * `$`-prefixed matches; only falls back to bare decimals (e.g. "12.99"
 * with no dollar sign) if there are no `$` matches at all, since bare
 * decimals are far more likely to be false positives (weights, quantities,
 * unit prices like "$4.29/lb" already captured, etc).
 */
export function extractPriceCandidates(text: string): PriceCandidate[] {
  const dollarMatches = [...text.matchAll(DOLLAR_PRICE)]
  const matches = dollarMatches.length > 0 ? dollarMatches : [...text.matchAll(BARE_DECIMAL_PRICE)]

  const seen = new Set<number>()
  const candidates: PriceCandidate[] = []
  for (const match of matches) {
    const value = Number(match[1])
    if (Number.isNaN(value) || value <= 0 || value > 9999) continue
    if (seen.has(value)) continue
    seen.add(value)
    candidates.push({ raw: match[0].trim(), value })
  }
  return candidates
}

export interface PriceOcrResult {
  text: string
  candidates: PriceCandidate[]
}

/**
 * Runs OCR on an image and extracts price candidates from the recognized
 * text. Spins up (and tears down) a fresh tesseract worker per call — this
 * is a low-frequency, user-initiated action (one photo at a time), so the
 * simplicity of not managing worker lifecycle across calls is worth the
 * ~1-2s of extra startup latency.
 */
export async function recognizePriceFromImage(image: File | Blob | string): Promise<PriceOcrResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const {
      data: { text },
    } = await worker.recognize(image)
    return { text, candidates: extractPriceCandidates(text) }
  } finally {
    await worker.terminate()
  }
}
