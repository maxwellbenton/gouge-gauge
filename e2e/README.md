# e2e tests

Playwright tests covering the scan → price capture flow, including a real
camera-decode path — not a mocked/stubbed detector.

## How the fake camera works

Chromium supports feeding a video file as the camera source instead of real
hardware, via `--use-fake-device-for-media-stream` combined with
`--use-file-for-fake-video-capture=<path>`. `playwright.config.ts` wires this
up for the whole Chromium project, pointing at `e2e/fixtures/barcode.y4m` — a
short, uncompressed (Y4M) video looping a single frame of a real, valid
EAN-13 barcode.

This means the app's actual `@zxing/browser` decode pipeline runs against
real video frames in these tests, the same code path as a real phone camera.
Nothing about barcode detection is mocked.

`e2e/fixtures/barcode.y4m` is a committed binary fixture (~900KB). To
regenerate it (e.g. to encode a different barcode), see
`scripts/generate-e2e-barcode-fixture.py` — it needs `python-barcode`,
`Pillow`, and `ffmpeg`, none of which are part of the npm project since
they're one-off fixture-generation tooling, not app or test runtime
dependencies. The script prints the exact decoded value ZXing will report;
update `FIXTURE_BARCODE` in `scan.spec.ts` if it changes.

## Known trade-off: one fixture, shared globally

The fake camera is configured once for the whole browser process, so every
test's Scan page camera view is decoding the *same* barcode continuously
from the moment it mounts — there's no way to vary it per test without
spinning up separate browser launches. Practically:

- The one test that's actually about camera scanning
  (`camera scan of an unknown barcode...`) waits for the camera to detect
  the barcode on purpose.
- Every other test that needs the Scan page clicks "Enter barcode manually"
  immediately after `page.goto('/')` (or after "Scan another"), which stops
  the camera. This assumes that click reliably wins the race against the
  camera's async startup (dynamic import of the ~450KB zxing chunk +
  `getUserMedia` negotiation + first decode attempt), which should hold in
  practice but is worth knowing about if a test ever flakes around that
  moment — the fix would be adding an explicit small wait before the manual
  click, or restructuring so the camera doesn't auto-start on mount.

## Real product photos (`e2e/real-photos/`)

`scan.spec.ts` uses one synthetic, easy-to-read barcode. `e2e/real-photos/`
instead uses genuine phone photos of real products (`e2e/images/*.jpg`) —
off-angle, cluttered backgrounds, real focus issues — decoded by the app's
actual pipeline, not staged for easy reading. Metadata (barcode value,
product name to type in, whether it's expected to decode) lives in
`e2e/fixtures/real-products.ts`.

Ground truth for each barcode was established *before* any test was written:
a standalone Node script decoded the processed image via `@zxing/library`
directly (no browser involved), and that was cross-checked against the
human-readable digits printed under the bars on the label. One image
(`dog-treat.jpg`) is genuinely out of focus — tried at four rotations, with
contrast boost, sharpening, and a tight crop around just the barcode, and it
still doesn't decode. That's used deliberately as a "camera can't read this,
falls back to manual entry" test case, not discarded as a bad fixture.

`scripts/generate-real-photo-fixtures.py` converts the source JPGs into
`e2e/fixtures/<id>.y4m` (EXIF-orient, since phones store portrait photos
rotated + a metadata flag that Pillow doesn't apply automatically; resize;
convert to yuv420p). Re-run it if the source photos change, and re-verify
decodability the same way (see the script's docstring) before trusting new
values in `real-products.ts`.

### Why one spec file per photo

Each real photo needs its *own* fake-camera video, but Playwright requires
`test.use({ launchOptions })` to be top-level in a file — not inside a
`test.describe` block — because changing `launchOptions` forces a new
worker/browser process. (Confirmed by running `npx playwright test --list`,
which fails fast with a clear error if you get this wrong — worth doing
before assuming any particular structure works.) So instead of one file
looping over all five fixtures, there's one small file per fixture
(`e2e/real-photos/kerrigold.spec.ts` etc.) that sets `test.use()` for its
own video and calls into shared test bodies in `_shared.ts`. This means the
suite launches a separate browser per real-photo fixture (five extra
launches), so it's slower than `scan.spec.ts` — inherent to testing against
distinct per-product video rather than one shared fixture.

## Known trade-off: the "Add store" click races its own handler

`e2e/helpers.ts` exports `addNewStoreInline()`, used everywhere a test drives
StorePicker's inline "+ Add a new store" flow. This exists because of a real
failure found by actually running the suite: clicking "Add store" fires an
async handler (`createStore()` — an IndexedDB write — then `onChange(id)`),
but Playwright's `.click()` resolves as soon as the click event dispatches,
not once that handler finishes. Filling Price and clicking "Save price"
immediately after "Add store" would sometimes race ahead of `onChange(id)`,
so `storeId` was still `null` when Save ran — the app's own
`if (!storeId) { setError(...); return }` guard then silently no-ops the
save instead of erroring loudly, which is what made every camera/manual
price-capture test fail at the same "Saved heading never appears" point the
first time this actually ran against a browser. The helper waits for the
"+ Add a new store" link to reappear (StorePicker only returns to that view
in the same update that calls `onChange`) before letting a test continue —
a real synchronization point, not a fixed sleep.

## Repo size

The committed video fixtures add up: `barcode.y4m` (~900KB) plus five
`e2e/fixtures/*.y4m` (~1.6MB each, ~8MB total) plus the five source JPGs in
`e2e/images/` (~10MB total) — roughly 19MB added to the repo. Worth knowing
if that's a concern; the JPGs in particular could be dropped once the y4m
fixtures are generated and verified, since nothing re-reads them at test
time (only the generation script does).

## Running

```
npx playwright install chromium   # one-time, downloads a browser binary
npm run test:e2e
```

`npm run test:e2e` boots the Vite dev server automatically (see
`webServer` in `playwright.config.ts`) and runs against Chromium only —
Firefox/WebKit don't support the same fake-camera flags, so this suite
doesn't run there.
