/**
 * OCR-based extraction from photos — shelf-tag prices (M5), and product
 * screenshots from online shopping sites (M5.5, no barcode to key off of,
 * so name + price both matter).
 *
 * tesseract.js is dynamically imported so it never lands in the main
 * bundle — same code-splitting pattern used for @zxing/browser in
 * useBarcodeScanner.ts. This is a spike-grade helper: it recognizes plain
 * text and regexes prices/name lines out of it, deliberately skipping
 * tesseract's word-level bounding-box output (`output: { blocks: true }`)
 * since the text-only path was accurate enough on the synthetic fixtures in
 * scripts/ocr-spike.ts (see docs/OCR-SPIKE.md for the writeup).
 *
 * Per docs/DESIGN.md §5, this NEVER auto-fills or auto-submits anything on
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

// Common shopping-site chrome that shows up as its own text line near a
// product title but isn't one — filtered out before ranking name lines.
const NOISE_LINE = /^(add to cart|buy now|in stock|out of stock|sold out|free shipping|free returns|qty|quantity|save \$?\d|\d+(\.\d+)?\s*(out of 5|stars?|reviews?|ratings?)|\$?\d+(\.\d+)?\s*(off|%)?)$/i

/**
 * Picks out lines from OCR'd text that plausibly look like a product
 * name/brand — the closest thing to a "title" a screenshot has, since
 * there's no barcode to establish the product first (unlike M5's shelf-tag
 * flow). Deliberately loose: filters out obvious non-name lines (prices,
 * ratings, button labels) and ranks what's left by length, on the theory
 * that a product title tends to be the longest text block on a listing
 * relative to price tags, star ratings, and button chrome. Always just a
 * starting point — the caller lets the user edit or pick a different one.
 */
export function extractNameCandidates(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const candidates = lines.filter((line) => {
    if (line.length < 4) return false
    if (NOISE_LINE.test(line)) return false
    // Lines that are mostly digits/currency/punctuation are price or
    // quantity lines, not a product name, even ones that slipped past the
    // noise patterns above (e.g. a stray "4.5" rating without "stars").
    const letters = line.replace(/[^a-zA-Z]/g, '').length
    if (letters < line.length * 0.4) return false
    return true
  })

  return [...new Set(candidates)].sort((a, b) => b.length - a.length).slice(0, 5)
}

export interface PriceOcrResult {
  text: string
  candidates: PriceCandidate[]
}

export interface ScreenshotOcrResult {
  text: string
  nameCandidates: string[]
  priceCandidates: PriceCandidate[]
}

/**
 * Runs OCR on an image and returns the raw recognized text. Spins up (and
 * tears down) a fresh tesseract worker per call — this is a low-frequency,
 * user-initiated action (one photo at a time), so the simplicity of not
 * managing worker lifecycle across calls is worth the ~1-2s of extra
 * startup latency.
 */
async function runOcr(image: File | Blob | string): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const {
      data: { text },
    } = await worker.recognize(image)
    return text
  } finally {
    await worker.terminate()
  }
}

/** OCR a shelf-tag/price-sticker photo (M5) — used by PriceEntryForm's
 * "Scan price from a photo." */
export async function recognizePriceFromImage(image: File | Blob | string): Promise<PriceOcrResult> {
  const text = await runOcr(image)
  return { text, candidates: extractPriceCandidates(text) }
}

/** OCR a screenshot from an online shopping site (M5.5) — no barcode, so
 * this extracts both a product name and a price rather than just a price. */
export async function recognizeScreenshot(image: File | Blob | string): Promise<ScreenshotOcrResult> {
  const text = await runOcr(image)
  return {
    text,
    nameCandidates: extractNameCandidates(text),
    priceCandidates: extractPriceCandidates(text),
  }
}
