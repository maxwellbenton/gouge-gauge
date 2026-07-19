# GougeGauge — Roadmap

Milestones are ordered by dependency, not calendar time — no dates attached yet since scope per milestone should drive that once we start building. Each milestone should leave the app in a usable (if limited) state.

## M0 — Scaffolding

Get an empty-but-real PWA running before any feature work.

- Repo setup, TypeScript + React + Vite project structure.
- PWA manifest + service worker wired up (`vite-plugin-pwa`), installable on a phone even with zero features, to de-risk the "can I actually add this to my home screen" question early.
- Basic app shell / navigation (Scan, Compare, Lists, Stores).
- CI: lint + typecheck + build on push.

**Exit criteria**: installable blank app on a real phone via "Add to Home Screen."

## M1 — Capture: Scan + Manual Price Entry

The single-store half of the core loop.

- Camera access + barcode scanning (`BarcodeDetector` w/ polyfill fallback).
- Manual price entry screen after a scan (price, store picker, size/unit if new product).
- Local persistence via Dexie/IndexedDB: Product, Store, PriceEntry.
- Store management: add/select store, remember recently-used stores.

**Exit criteria**: scan Blue Buffalo dog food at Tractor Supply, enter $67, and see it saved and retrievable.

## M2 — Compare: Cross-Store Price Lookup

Scanning a known product surfaces prior data instead of just re-prompting for entry.

- On scan, check local DB for existing `PriceEntry` records for that barcode.
- Comparison view: all known prices for the product, ranked by unit price, current store highlighted.
- Unit price computation (price ÷ size) and handling for products without size data (fall back to sticker price with a caveat, prompt user to add size when convenient).

**Exit criteria**: scan Blue Buffalo at Petco after having logged Tractor Supply, immediately see Tractor Supply is cheaper.

## M3 — Sale & Bulk Pricing

Data model support for deals, since it changes what "the price" even means.

- `is_sale` / `sale_ends_at` fields + UI toggle at entry time.
- `bulk_qty` deal entry (e.g., "3 for $10") with automatic effective-unit-price calculation.
- Comparison view distinguishes sale/bulk prices from standard price (flag or badge), and can exclude expired sales from default comparisons.

**Exit criteria**: log a BOGO deal and a time-limited sale price, see both reflected correctly in comparisons.

## M4 — Shopping Lists

Turn accumulated price data into action.

- Build a list from products with existing price history; auto-group by cheapest current store.
- Per-item store override (buy elsewhere anyway) and purchased toggle, independent of each other.
- Store-grouped view for "everything I need at this store" during an actual trip.

**Exit criteria**: build a "dog supplies" list, see it grouped by store, reassign one item to a different store, check items off during a mock trip.

## M5 — Price OCR (Stretch, can run parallel to M3/M4)

Enhancement layer over manual entry, not a blocker for anything else.

- Client-side OCR spike (Tesseract.js) against real shelf-tag photos to validate accuracy before committing further.
- If viable: photo-to-price-field prefill on the entry screen, always user-confirmed before saving.
- If not viable client-side: evaluate a cloud OCR fallback (Vision/Textract) behind the same interface.

**Exit criteria**: a documented accuracy spike, plus (if viable) working prefill-from-photo on the entry screen.

## M6 — Accounts & Sync Backend

Required infrastructure before any cross-user sharing is possible.

- Backend stood up (Fastify + Postgres, e.g. via Supabase) with magic-link auth.
- Device-to-account sync of local data (upload local IndexedDB history, pull it back on a second device).
- Product metadata passthrough to a public barcode DB (Open Food Facts/UPCItemDB) for barcodes with no local history yet.

**Exit criteria**: log in on a second device, see the same price history without re-scanning anything.

## M7 — Sharing & Merging

- Tier 1: local export/import (JSON) for a no-account "send a friend my data" path — can technically ship before M6 if sequencing works out, but grouped here since it's lower priority than the solo loop working well.
- Tier 2: Share Groups — create/join via invite link, merged comparison view across all members' entries, basic store-identity de-duplication (fuzzy name matching, optional geo-assist).

**Exit criteria**: two test accounts in the same share group both see each other's price entries in comparisons.

## M8 — PWA Polish

- Icons, splash screens, manifest polish across iOS/Android install flows (these differ more than expected — needs real-device testing, not just Chrome DevTools).
- Offline resilience pass: confirm full capture/compare/list flow works with no connectivity, background sync resumes cleanly when back online.
- Performance pass on camera/scan responsiveness (this is the most-used interaction in the app — worth extra attention).

**Exit criteria**: full core loop works offline on both an iOS and an Android device, installed from the browser.

## M9 — Beta & Launch

- Closed beta with a handful of real users (ourselves + a few others actually doing grocery/pet-supply shopping) logging real data for a couple weeks.
- Bug-fix pass driven by real usage rather than assumptions.
- Final naming/branding check (see Design doc §10 — confirm "GougeGauge" is fine to ship publicly) and public release of the install link.

**Exit criteria**: real users using it unprompted on real shopping trips.

---

### Sequencing notes

- M1 → M2 → M4 is the critical path for the headline feature set; M3 (sale/bulk) can slot in wherever convenient once M1 exists since it's additive to the data model.
- M5 (OCR) is explicitly decoupled — do the accuracy spike early if there's appetite to de-risk it, but nothing downstream depends on it succeeding.
- M6/M7 (sync + sharing) is the one clear "this needs a backend" boundary — everything before it is deliberately achievable as a local-only app.
