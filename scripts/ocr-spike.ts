/**
 * M5 accuracy spike: run tesseract.js against the synthetic fixtures in
 * e2e/fixtures/ocr/ (see scripts/generate-ocr-spike-fixtures.py) and report
 * what price(s) get extracted from each. This is a one-off diagnostic, not
 * part of the app or the smoke-test suite — run manually with:
 *
 *   npx tsx scripts/ocr-spike.ts
 *
 * Findings get written up in docs/OCR-SPIKE.md.
 */
import { createWorker } from 'tesseract.js'
import { extractPriceCandidates } from '../src/lib/priceOcr.js'

const FIXTURES = [
  { file: 'simple_clean.png', expect: [12.99] },
  { file: 'shelf_tag.png', expect: [8.49] },
  { file: 'sale_vs_reg.png', expect: [3.99, 5.99] },
  { file: 'no_price.png', expect: [] },
  { file: 'blurry_angle.png', expect: [8.49] },
]

async function main() {
  // In this sandbox, tesseract.js's default jsdelivr CDN fetch for
  // eng.traineddata is network-blocked. In the real app (browser) this CDN
  // fetch works fine and is cached by the service worker; for this Node
  // spike, point langPath at the local copy pulled in via
  // `npm install @tesseract.js-data/eng` instead.
  const langPath = new URL('../node_modules/@tesseract.js-data/eng/4.0.0', import.meta.url).pathname
  const worker = await createWorker('eng', 1, { langPath })
  let pass = 0

  try {
    for (const { file, expect } of FIXTURES) {
      const path = new URL(`../e2e/fixtures/ocr/${file}`, import.meta.url)
      const {
        data: { text },
      } = await worker.recognize(path.pathname)
      const candidates = extractPriceCandidates(text)
      const got = candidates.map((c) => c.value)

      const ok = expect.length === got.length && expect.every((v) => got.includes(v))
      pass += ok ? 1 : 0

      console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${file}`)
      console.log(`  raw text: ${JSON.stringify(text.trim().replace(/\n/g, ' \\n '))}`)
      console.log(`  expected: [${expect.join(', ')}]  got: [${got.join(', ')}]`)
    }
  } finally {
    await worker.terminate()
  }

  console.log(`\n${pass}/${FIXTURES.length} fixtures matched expected price candidates`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
