# GougeGauge

*Working title.* A PWA for scanning product barcodes, logging store prices, comparing them across stores, and building shopping lists that save you money.

- [Design](docs/DESIGN.md) — architecture, data model, and key decisions.
- [Roadmap](docs/ROADMAP.md) — milestones from scaffolding to launch.

## Status

M0–M5.5 done. You can scan a barcode (camera or manual entry), log a price against a store — including sale prices and bulk/multi-buy deals ("3 for $10", BOGO) — and see it saved, all stored locally in IndexedDB, no backend yet. Scanning a barcode you've already logged immediately shows every store's latest price for it, ranked by effective per-item price (unit price where a size is on file), cheapest highlighted, sale/deal badges shown — both inline on the Scan flow and via the standalone Compare tab, which lists every logged product with its best known price. Expired sales drop out of comparisons automatically rather than being treated as a store's current price. The Lists tab builds shopping lists from products you've already priced, auto-grouped by whichever store is currently cheapest for each item — reassign any item to a different store regardless of price, and check items off independently of that. Price entry also supports snapping a photo of a shelf tag ("Scan price from a photo") to prefill the price field via on-device OCR — always shown for confirmation, never auto-saved; see `docs/OCR-SPIKE.md` for the accuracy writeup. There's also a barcode-free path for online shopping: "Import from a screenshot" on the Scan page OCRs a product-page or cart screenshot for a likely name and price, matches it against anything already logged (so re-importing the same listing doesn't create a duplicate), and drops into the same store + price entry flow. See the roadmap for what's next.

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

## Deployment

Deployed to GitHub Pages via `.github/workflows/deploy.yml` — every push to `master` builds and publishes automatically. GitHub Pages is a plain static host, which is enough here since there's no backend yet (everything's local IndexedDB); it also serves over HTTPS, which real device testing needs anyway — camera access and PWA installability both require it (a plain `http://` LAN IP won't get either).

**One-time setup**, once this repo exists on GitHub:

```
git remote add origin git@github.com:<you>/gougegauge.git   # or the https:// URL
git push -u origin master
```

Then in the repo's GitHub Settings → Pages, set **Source** to **GitHub Actions** (not the legacy "Deploy from a branch" option — that one won't run the workflow). The first push after that kicks off a deploy; check the Actions tab for progress, and the same Pages settings page for the live URL once it finishes (`https://<you>.github.io/<repo-name>/`).

From then on, `git push` to `master` is all that's needed — no separate deploy step. On your phone: open that URL, then use the browser's "Add to Home Screen" (Safari) or the install prompt (Chrome) to install it.

The build's `base` path (so assets resolve correctly under `/<repo-name>/` rather than the domain root) is set automatically from the repo name during the GitHub Actions build — nothing to configure by hand, and `npm run build` locally is unaffected (still builds for `/`).
