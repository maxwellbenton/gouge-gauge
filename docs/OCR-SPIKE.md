# M5 OCR Spike — Findings

Per `docs/DESIGN.md` §5 and `docs/ROADMAP.md` M5's exit criteria: a documented accuracy spike before committing to client-side OCR (Tesseract.js) as the approach.

## Setup

`scripts/generate-ocr-spike-fixtures.py` renders five synthetic shelf-tag-style PNGs into `e2e/fixtures/ocr/`:

- `simple_clean.png` — plain text, one price ("PRICE $12.99").
- `shelf_tag.png` — bigger price text with a unit ("$8.49 / per lb"), closer to a real shelf tag's layout.
- `sale_vs_reg.png` — two prices in one image ("NOW $3.99" / "WAS $5.99"), the multi-candidate case.
- `no_price.png` — product description text only, no price at all — the "graceful degradation" case.
- `blurry_angle.png` — the shelf-tag image rotated ~9° and Gaussian-blurred, a rough stand-in for a real photo taken off-angle under bad lighting.

`scripts/ocr-spike.ts` runs each through `tesseract.js`'s `createWorker`/`recognize` (Node), then through `extractPriceCandidates` (`src/lib/priceOcr.ts`), and checks the result against the expected price(s).

## Result

**5/5 fixtures matched expected output**, including the degraded/blurry one:

```
PASS  simple_clean.png    → [12.99]
PASS  shelf_tag.png       → [8.49]
PASS  sale_vs_reg.png     → [3.99, 5.99]
PASS  no_price.png        → []
PASS  blurry_angle.png    → [8.49]
```

Notably, `blurry_angle.png` garbled the surrounding label text badly ("EVERYDAY LOW PRICE" came back as "cveRORY LOW PRE"), but the price itself — larger, bolder text — still came through cleanly. That's a reasonable sign that price extraction is more robust to real-world photo degradation than full-text accuracy would suggest, since `extractPriceCandidates` only cares about the `$`-prefixed numeric substrings, not the surrounding words.

## Caveats — this is not a real-world accuracy guarantee

These are rendered PNGs, not real photos. Real shelf-tag photos will have glare, tighter/more varied fonts, uneven lighting, JPEG compression artifacts, and background clutter (adjacent price tags, shelf edges, barcodes) that a clean synthetic image doesn't reproduce. The spike proves the pipeline works mechanically end to end and that price-specific extraction tolerates *some* degradation — it does not prove real-world accuracy. If real-world usage shows the client-side approach struggling, revisit the cloud OCR fallback path noted in the original M5 plan (Vision/Textract behind the same `recognizePriceFromImage` interface).

## Decision

Shipped client-side, no cloud fallback for now. `src/lib/priceOcr.ts` wraps `tesseract.js` (dynamically imported, code-split out of the main bundle) and wires into `PriceEntryForm` via a "Scan price from a photo (beta)" control:

- Zero or one price found → straightforward (prefill or "not found" message).
- Multiple prices found → shown as tappable chips, not auto-picked, so a sale-vs-regular photo doesn't silently grab the wrong one.
- Never auto-submits — the user still has to hit "Save price," per the design doc's OCR rule.

## A sandbox-specific note, not an app concern

`tesseract.js` fetches its wasm core and language data lazily from the jsdelivr CDN by default — completely normal, and how it behaves on a real device with real internet. The dev sandbox this was built in has no general internet access, so both `scripts/ocr-spike.ts` (Node) and `e2e/ocr.spec.ts` (Playwright) reroute those specific requests to local copies already present via `@tesseract.js-data/eng` and `tesseract.js-core` in `node_modules` (see `e2e/ocr-cdn-route.ts`). This has no bearing on the shipped app, which uses tesseract.js's normal CDN defaults.
