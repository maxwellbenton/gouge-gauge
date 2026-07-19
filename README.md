# GougeGauge

*Working title.* A PWA for scanning product barcodes, logging store prices, comparing them across stores, and building shopping lists that save you money.

- [Design](docs/DESIGN.md) — architecture, data model, and key decisions.
- [Roadmap](docs/ROADMAP.md) — milestones from scaffolding to launch.

## Status

M0–M4 done. You can scan a barcode (camera or manual entry), log a price against a store — including sale prices and bulk/multi-buy deals ("3 for $10", BOGO) — and see it saved, all stored locally in IndexedDB, no backend yet. Scanning a barcode you've already logged immediately shows every store's latest price for it, ranked by effective per-item price (unit price where a size is on file), cheapest highlighted, sale/deal badges shown — both inline on the Scan flow and via the standalone Compare tab, which lists every logged product with its best known price. Expired sales drop out of comparisons automatically rather than being treated as a store's current price. The Lists tab builds shopping lists from products you've already priced, auto-grouped by whichever store is currently cheapest for each item — reassign any item to a different store regardless of price, and check items off independently of that. See the roadmap for what's next.

## Development

```
npm install
npm run dev         # local dev server
npm run lint        # oxlint
npm run build       # typecheck + production build
npm run preview     # serve the production build locally
npm run test:smoke  # data-layer smoke test (fake-indexeddb)
npm run test:e2e    # Playwright e2e (Chromium only — see e2e/README.md)
```

Scanning needs camera access, so `npm run dev` is best tested on a phone: run it, then open the printed network URL on a phone on the same network (or use a tunnel like `ngrok`) — camera APIs generally require HTTPS or localhost, so a plain LAN IP over http may prompt for a permission Safari/Chrome won't grant. The manual barcode entry field works regardless.

`npm run test:e2e` needs a Chromium binary the first time: `npx playwright install chromium`. It exercises the real scan flow, including a genuine camera-decode test against a fake video device — see `e2e/README.md` for how that's set up.
