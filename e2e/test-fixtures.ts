import { test as base, type Page } from '@playwright/test'

// Extends the base `test` so every test in this suite automatically prints
// browser console errors and uncaught exceptions to the Playwright test
// output. Added after two rounds of guessing wrong about why "Save price"
// wasn't reaching the 'Saved' step (first a real but insufficient race fix,
// then a timeout bump that made zero difference) — the actual answer is
// almost certainly sitting in the browser console already, and this makes
// it show up automatically next run instead of requiring someone to dig
// into a trace.zip by hand.
//
// Note: the `use` parameter below is Playwright's fixture-setup callback,
// not React's `use()` hook — oxlint's react-hooks rule doesn't know the
// difference, so it's disabled for e2e/** in .oxlintrc.json.
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    page.on('console', (msg) => {
      // Was error-only; widened to every console level while chasing the
      // "Look up price" detachment on the third scan/detect cycle in
      // scan.spec.ts — two targeted fixes based on reading the code didn't
      // resolve it, and the scanner lifecycle logging added alongside this
      // (see useBarcodeScanner.ts / ScanPage.tsx) is console.debug, not
      // console.error, so it needs every level forwarded to actually show up
      // here.
      console.log(`[browser ${msg.type()}] ${msg.text()}`)
    })
    page.on('pageerror', (err) => {
      console.log(`[browser uncaught exception] ${err.message}\n${err.stack ?? ''}`)
    })
    await use(page)
  },
})
