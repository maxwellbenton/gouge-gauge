# GougeGauge

*Working title.* A PWA for scanning product barcodes, logging store prices, comparing them across stores, and building shopping lists that save you money.

- [Design](docs/DESIGN.md) — architecture, data model, and key decisions.
- [Roadmap](docs/ROADMAP.md) — milestones from scaffolding to launch.

## Status

M0 and M1 done. You can scan a barcode (camera or manual entry), log a price against a store, and see it saved — all stored locally in IndexedDB, no backend yet. Compare (M2) and Lists (M4) are still placeholders. See the roadmap for what's next.

## Development

```
npm install
npm run dev         # local dev server
npm run lint        # oxlint
npm run build       # typecheck + production build
npm run preview     # serve the production build locally
npm run test:smoke  # data-layer smoke test (fake-indexeddb)
```

Scanning needs camera access, so `npm run dev` is best tested on a phone: run it, then open the printed network URL on a phone on the same network (or use a tunnel like `ngrok`) — camera APIs generally require HTTPS or localhost, so a plain LAN IP over http may prompt for a permission Safari/Chrome won't grant. The manual barcode entry field works regardless.
