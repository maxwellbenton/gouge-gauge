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

## Running

```
npx playwright install chromium   # one-time, downloads a browser binary
npm run test:e2e
```

`npm run test:e2e` boots the Vite dev server automatically (see
`webServer` in `playwright.config.ts`) and runs against Chromium only —
Firefox/WebKit don't support the same fake-camera flags, so this suite
doesn't run there.
