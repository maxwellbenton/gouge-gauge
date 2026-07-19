# GougeGauge — High-Level Design

Working title: **GougeGauge**. A price-tracking PWA that lets shoppers scan a product's barcode, log what it costs at the store they're standing in, and instantly see whether they've found a good deal or a gouge based on prices they (or friends) have logged elsewhere.

## 1. Problem & Core Loop

Grocery and retail prices for the same item vary a lot store to store, and nobody remembers what they paid last time or at the other store across town. The core loop this app supports:

1. **Capture**: scan a barcode, attach a price, store, and timestamp.
2. **Compare**: scanning a barcode you've seen before immediately shows every price on record for that product, ranked, with the current store highlighted.
3. **Plan**: turn "products I usually buy" into a shopping list auto-sorted by cheapest store, which the user can still hand-edit.
4. **Share**: merge price data with other users (household, friends, community) so the dataset gets useful faster than any one person scanning alone.

Everything else in this doc supports that loop.

## 2. Platform Choice: PWA

A installable Progressive Web App, not a native app, for v1.

- One codebase, no app store review cycle, works on iOS and Android via "Add to Home Screen."
- Camera access (`getUserMedia`) and the native `BarcodeDetector` API (Chrome/Android; polyfilled elsewhere) are sufficient for barcode scanning — no native module needed.
- Offline-first via Service Worker + IndexedDB means the app is fully usable with no signal in a store's back aisle, which is a real constraint worth designing around from day one.
- If demand later justifies it, the same web app can be wrapped with Capacitor for app-store distribution without a rewrite.

## 3. Architecture Overview

```
┌─────────────────────────────┐
│           Client (PWA)      │
│  React + Vite, TypeScript   │
│  Service Worker (Workbox)   │
│  IndexedDB (Dexie.js) ── local-first store of record
│  Camera / BarcodeDetector   │
│  Optional OCR (Tesseract.js)│
└──────────────┬───────────────┘
               │ sync (background, when online)
               ▼
┌─────────────────────────────┐
│        Sync/API Backend      │
│  Fastify/Node or Cloudflare  │
│  Workers, Postgres (Supabase)│
│  Auth (magic link / OAuth)  │
│  Product lookup passthrough │
│  (Open Food Facts / UPCitemdb)│
└─────────────────────────────┘
```

Key principle: **the device is the source of truth for a user's own scans**; the backend exists to sync across a user's devices and to merge data between users who choose to share. A user who never creates an account can still use the whole capture/compare/plan loop locally — sharing is what requires the network layer.

### 3.1 Client

- **Framework**: React + TypeScript, built with Vite. Vite's PWA plugin (`vite-plugin-pwa`) handles manifest + service worker generation.
- **Local storage**: Dexie.js over IndexedDB. All price entries, products, stores, and shopping lists live here first; sync is an overlay, not a requirement.
- **Barcode scanning**: `BarcodeDetector` where available, falling back to a JS library (`@zxing/browser` or `zbar-wasm`) on browsers without native support (notably Safari/iOS as of last check — worth re-verifying at build time since support shifts).
- **Price OCR (stretch, see §5)**: `Tesseract.js` running client-side (no image leaves the device unless the user opts into a cloud OCR fallback for accuracy).

### 3.2 Backend

- Minimal by design. Responsibilities:
  - Account creation and auth (email magic link is enough for v1 — avoids password management).
  - Sync endpoint: accept/return deltas of price entries, products, and stores per user or per "share group."
  - Optional product-metadata passthrough to a public barcode database (Open Food Facts, UPCItemDB) so a scanned barcode the user has never logged can still resolve to a product name/image instead of a bare number.
- **Stack**: Node (Fastify) + Postgres, hosted on something like Supabase or Render to avoid standing up infra by hand. Supabase specifically buys us Postgres + auth + row-level security for share groups in one product, which is a good fit for a small team/solo project.

## 4. Data Model

Conceptually:

**Product**
`id, barcode (UPC/EAN), name, brand, size/unit (e.g. "24 lb bag"), image_url, source ("user" | "openfoodfacts")`

**Store**
`id, name, location (free text or geo), created_by, notes`

**PriceEntry** — the core record, one per scan
`id, product_id, store_id, price, unit_price (computed: price / size), is_sale (bool), sale_ends_at (nullable), bulk_qty (nullable, e.g. "buy 2 get 1"), captured_at, captured_by, source ("manual" | "ocr"), photo_ref (optional, local-only)`

**ShoppingListItem**
`id, list_id, product_id, target_store_id (nullable override), quantity, purchased (bool), purchased_at, purchased_store_id (nullable, may differ from target_store_id)`

**ShareGroup / ShareMember**
`group_id, member_user_id, joined_at` — a lightweight "household or friend circle" that price entries can be scoped to. A `PriceEntry` visible to a group is really just "included in the merged view for that group's members," not a different data type.

Two modeling decisions worth calling out:

- **Unit price, not sticker price, drives comparisons.** A $67 24 lb bag and a $74 30 lb bag aren't directly comparable — the app should compare price-per-lb (or per-oz, per-count, whatever unit the product uses) and just be honest that this requires size data, which won't always be available or accurate. Size can be user-entered once per product and reused.
- **Price history, not price overwrite.** Every scan is a new `PriceEntry`, never an update to an existing one. This is what lets sale prices, price trends over time, and multi-user contributions coexist without clobbering each other, and it's what makes merging between users straightforward (append, don't reconcile).

## 5. Reading Prices from Photos (OCR)

Preferred when available, per your notes, but treated as an enhancement layer over manual entry rather than a dependency:

1. User scans barcode → app shows a quick-entry screen with a numeric keypad already focused.
2. User can instead (or additionally) snap a photo of the shelf tag/receipt line; `Tesseract.js` attempts to extract a dollar amount and pre-fills the field for confirmation.
3. User always confirms/edits the number before it saves — OCR pre-fills, it never silently commits a price. Shelf tags are inconsistent enough (unit price vs. total price, sale tags, tiny fonts) that blind trust would poison the dataset.

If client-side OCR accuracy proves too low in testing, a cloud OCR fallback (Google Cloud Vision / AWS Textract) is a config-level swap, not an architecture change, since the extraction step is already isolated behind "give me a candidate price string."

## 6. Sale Prices & Bulk Deals

Handled as fields on `PriceEntry` rather than a separate concept:

- `is_sale` + `sale_ends_at`: lets the comparison view flag "this price won't last" and optionally warn or auto-expire it from default comparisons after that date.
- `bulk_qty`: captures things like "3 for $10" or "buy one get one." Store as the effective unit price after the deal, plus a human-readable label, so comparison logic doesn't need special-case math per deal type — it always compares unit prices, and bulk deals just produce a lower one.

## 7. Shopping Lists

A shopping list is built from products the user has price data for, grouped by whichever store currently has the best unit price for each item — but grouping is a *default sort*, not a constraint:

- Each list item shows its assigned store (cheapest by default) and can be manually reassigned to any other store the user has price data for, or marked "buying elsewhere" without penalty.
- Items can be checked off (`purchased = true`) independent of whether they were bought at the suggested store — the `purchased_store_id` can diverge from `target_store_id` to capture "I know Tractor Supply was cheaper but I grabbed it at Petco anyway."
- View is grouped by store so a trip to a given store shows everything on the list assigned there — this is the actual point of the feature (efficient trips), not just a comparison table.

## 8. Sharing & Merging Data Between Users

Two tiers, roughly in order of implementation effort:

1. **Export/Import (no backend required)**: export your local price data as a JSON file, another user imports it and the app merges by `(barcode, store_name, captured_at)` dedup, keeping both if store names don't match closely enough to be confident they're the same store. This alone satisfies "share with a friend" for v1 without needing accounts.
2. **Share Groups (backend-backed)**: once accounts exist, a "group" (e.g. "Household," "Neighborhood Deal Hunters") can be created and joined via invite link/code. Every member's price entries scoped to that group sync automatically and comparisons pull from the merged pool. Store name collisions across users are the main data-quality risk here (two people both add "Walmart" as separate store records) — worth a lightweight store-matching/merge step, likely fuzzy-name + optional geolocation, rather than solving it perfectly in v1.

## 9. Key Risks / Open Questions

- **Barcode → product resolution for items with no public database entry.** Store-brand or regional products may not resolve via Open Food Facts/UPCItemDB. Fallback: user names the product manually the first time they scan it; it's remembered locally and shared like any other data.
- **Store identity resolution.** "Which store is this" needs to be low-friction (recent stores list, geolocation-assisted suggestion) or people won't bother logging it correctly.
- **OCR accuracy in real store lighting** is unproven until tested against real shelf tags — worth an early spike rather than assuming it works.
- **Data quality at scale** once sharing is on: bad-faith or careless entries could pollute a shared group's comparisons. Not a v1 problem, but worth keeping the append-only history model since it at least makes bad entries visible/reversible rather than destructive.

## 10. Naming Note

"GougeGauge" is a working title — fine for the repo name during build, worth a final sanity check on trademark/domain availability before any public launch.
