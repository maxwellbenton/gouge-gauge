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

## Compare tab / cross-store comparison (`compare.spec.ts`)

M2's comparison view is covered two ways:

- `scan.spec.ts`'s known-barcode test asserts the comparison appears
  *inline on the Scan flow* — the actual exit-criteria scenario (scan a
  barcode already logged at a cheaper store, see that immediately).
- `compare.spec.ts` covers the standalone Compare tab: browsing all logged
  products with a best-price summary, drilling into one for the full
  ranked-by-price list (cheapest badge, unit price per store), and adding a
  size after the fact to a product that didn't have one, confirming the
  unit price appears live via Dexie's `useLiveQuery` with no reload.

`compare.spec.ts` never touches the camera at all — every barcode in it is
typed through "Enter barcode manually" using arbitrary, non-fixture
strings, since manual entry doesn't decode anything; it just stores
whatever's typed as the product's barcode key. That sidesteps the shared
fake-camera-fixture trade-off below entirely for this file.

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

## Postmortem: why "Save price" never reached "Saved" (three fixes, only the third was right)

The first real run of this suite (once someone could actually launch
Chromium — see below) failed all 7 camera/price-entry tests at the same
point: click "Save price", the "Saved" heading never shows up. Getting to
the real cause took three attempts:

1. **Real but incomplete: a click/async race.** Clicking StorePicker's
   inline "Add store" fires an async handler (`createStore()`, an IndexedDB
   write, then `onChange(id)`), but Playwright's `.click()` resolves on
   event dispatch, not once that handler finishes. Filling Price and
   clicking Save immediately after could race ahead of `onChange(id)`, so
   `storeId` was sometimes still `null` when Save ran. `addNewStoreInline()`
   in `e2e/helpers.ts` waits for the "+ Add a new store" link to reappear
   (the real signal `onChange` fired) before continuing — worth keeping,
   but the suite still failed the same way after this fix.
2. **Wrong: assumed it was the default 5s assertion timeout.** Bumping
   `expect.timeout` from 5s to 10s changed nothing — same 7 tests, same
   exact failure point, every time. That was the tell it was never a
   timing problem; a real bug doesn't get slower or faster with more
   headroom.
3. **The actual bug: a `<form>` nested inside a `<form>`.** Once browser
   console errors were wired into the test output (`e2e/test-fixtures.ts`),
   the real cause was right there: `StorePicker`'s inline "add store" UI
   was a `<form>`, rendered inside `PriceEntryForm`'s own `<form>` — invalid
   HTML, and React said so explicitly ("cannot contain a nested form").
   Submit events bubble, so submitting the inner form (clicking "Add
   store") also fired the *outer* form's `onSubmit` — PriceEntryForm's
   `handleSubmit` — at that moment, with `storeId` and `price` both still
   empty, hitting its own validation guard and quietly doing nothing
   useful. By the time the real "Save price" click happened later, nothing
   was structurally wrong anymore, but the form had already been left in a
   confusing state. Fixed by making `StorePicker`'s inline form a plain
   `<div>` with `type="button"` handlers instead of a second `<form>` (see
   `StorePicker.tsx`).

Lesson worth keeping in mind for future debugging here: a consistent,
deterministic failure that doesn't budge when you add headroom is a real
bug, not a timing issue — the console-error logging from step 3 is what
actually should've been reached for first.

## Postmortem: "Look up price" got detached mid-click on the third scan cycle

M2 added a third scan/detect cycle to the existing manual-entry test (to
verify the comparison view after two stores have prices logged). It failed
— but only that new third cycle, not the first two — with `locator.click`
timing out after "element was detached from the DOM, retrying".

The cause was a real race in `useBarcodeScanner`, not the test: `start()`
does async work (dynamic `@zxing` import + `getUserMedia` negotiation)
before it has any `controls` to hand back. If `stop()` was called (e.g. the
user/test clicks "Enter barcode manually") while that was still in flight,
`stop()` had nothing to stop yet — and when `start()`'s awaits *later*
resolved, it just installed the fresh `controls` and flipped to "scanning"
as if `stop()` had never happened. Camera view or not, that decode loop is
now live, and the fake-camera fixture keeps feeding it the same barcode, so
it eventually fires `onDetect` and yanks the app to the price-entry step —
unmounting whatever manual-entry UI was mid-click.

This didn't show up on the test's first two scan cycles because the
`@zxing` chunk hadn't been fetched yet, so `start()`'s import+negotiation
was slow enough that the manual-entry click always won outright. By the
third cycle the chunk (and likely the camera permission/negotiation) was
already warm, so `start()` resolved fast enough to lose that race instead —
a good example of why "passes reliably" isn't the same as "race-free": the
timing just hadn't been unfavorable yet.

Fixed with a token in `useBarcodeScanner`: `stop()` bumps it, `start()`
captures it before the awaits and checks it's still current afterward,
discarding (and immediately stopping) any `controls` it gets back if a
`stop()` (or newer `start()`) superseded it in the meantime.

**That fix turned out to be real but still insufficient** — a re-run failed
identically, same line, same 45s timeout, completely unchanged. Rather than
guess a third time, lifecycle logging (`console.debug`, forwarded to the
Playwright test output via a widened `e2e/test-fixtures.ts` console
listener) was added to every `start()`/`stop()` call, token comparison, and
`ScanPage.handleDetected` call. The next real run's console output showed
the actual mechanism:

- React StrictMode (enabled in `main.tsx`, as it should be) double-invokes
  effects in dev: mount → cleanup → mount again. So *every* camera-view
  mount actually calls `start()` twice — a "phantom" call that gets
  `stop()`'d almost immediately, and the real one that survives.
- The log ordering showed the phantom's own `decodeFromConstraints`
  callback firing a real decode result *before its own outer `await` had
  resolved* — ZXing's internal scan loop appears to start (and can report a
  match) before the promise wrapping `decodeFromConstraints` settles. That
  means the "was I superseded?" check added in the first fix — which only
  ran *after* that `await` — was checking too late. The phantom had already
  called `onDetect` with a real barcode by the time its own supersession
  was detected.
- With the fake-camera fixture showing a decodable barcode from frame one,
  this phantom detection was firing on effectively *every* mount. It never
  mattered for a flow with one scan/detect cycle (the real scanner's own
  detection would fire moments later regardless), but by the third
  scan/detect cycle in the test it was enough noise in the step-transition
  timing to detach "Look up price" mid-click.

Real fix: move the token check *inside* the decode callback itself, not
just after the outer await — a result from a scanner whose `startId` no
longer matches the current token gets its loop stopped and is otherwise
discarded, live or not.

Lesson on top of the earlier one: when a targeted fix based on reading the
code doesn't change a deterministic failure *at all* — not flakier, not
different, identical — that's the signal to stop reasoning about the code
and go get real evidence (logging, a trace) instead of trying another
plausible-sounding fix.

**That fix worked** — the manual-entry test passed on the next run — but it
caused a new regression: all four real-photo decode tests, which normally
decode in ~3s, started timing out at the full 20s "waiting for the camera"
budget instead. The lifecycle logging (still in place) showed why: the fix
stopped the phantom scanner from *acting on* a detection, but it still let
the phantom call `getUserMedia`/`decodeFromConstraints` in the first place
— so on every mount, two concurrent camera negotiations were still opened
against the same fake-camera device (visible in the logs as "It was not
possible to play the video: AbortError... interrupted by a new load
request"). That was apparently harmless for the easy, from-frame-one
synthetic barcode, but measurably hurt decode reliability on the harder,
genuinely-imperfect real photos, which need more frames/attempts to
resolve.

Fix: check the supersession token *before* calling `decodeFromConstraints`
too, not only inside its result callback and after its promise resolves.
Because React StrictMode's cleanup-then-remount for this effect runs
synchronously, by the time the (often already-cached, near-instant)
`@zxing` dynamic imports resolve, a phantom call's token has typically
already been bumped past — so this catches it before `getUserMedia` is
ever called, instead of opening a second real camera stream and discarding
its result afterward. All three checks (before `getUserMedia`, inside the
result callback, after negotiation resolves) stay in place as
defense-in-depth for genuine start()/stop() sequences that aren't just the
StrictMode dev-mode artifact.

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
