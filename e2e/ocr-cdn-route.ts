import { existsSync } from 'node:fs'
import type { BrowserContext } from '@playwright/test'

/**
 * tesseract.js loads its wasm core and language traineddata lazily from the
 * jsdelivr CDN by default (see src/lib/priceOcr.ts) — completely normal for
 * a client-side OCR library, and what happens on a real device. But hitting
 * a real CDN in e2e is both slow and something that can't be relied on in
 * every environment (e.g. this repo's own dev sandbox has no general
 * internet access), so this reroutes those specific requests to the local
 * copies already sitting in node_modules — @tesseract.js-data/eng and
 * tesseract.js-core ship the exact same files jsdelivr would serve, since
 * jsdelivr's /npm/<package>/<path> URLs just mirror the published npm
 * package contents.
 *
 * This intercepts at the browser-context level (not just the page) because
 * tesseract.js does its fetching from inside a dedicated Web Worker, and
 * worker-issued requests only get seen by context-level routing.
 */
export async function routeTesseractCdnToLocal(context: BrowserContext): Promise<void> {
  await context.route('https://cdn.jsdelivr.net/npm/**', async (route) => {
    const url = new URL(route.request().url())
    const localPath = jsdelivrPathToLocalPath(url.pathname)
    if (!localPath || !existsSync(localPath)) {
      await route.abort()
      return
    }
    // Fulfilling with `path` (not a manually-read `body`) lets Playwright
    // infer the Content-Type from the file extension. This matters here:
    // fulfilling worker.min.js with a raw body defaults to text/plain,
    // which the browser's `importScripts()` rejects outright — surfaced as
    // a generic "NetworkError: ...failed to load", not an obvious
    // MIME-type complaint, which is what made this one worth a comment.
    await route.fulfill({ status: 200, path: localPath })
  })
}

/**
 * Maps a jsdelivr `/npm/<pkgspec>/<...file>` URL path to the corresponding
 * file under this project's node_modules, handling both scoped
 * (`@scope/name`) and unscoped packages, with or without an `@version`
 * suffix on the final package path segment.
 */
function jsdelivrPathToLocalPath(pathname: string): string | null {
  const match = pathname.match(/^\/npm\/(.+)$/)
  if (!match) return null
  let rest = match[1]

  let scope = ''
  if (rest.startsWith('@')) {
    const slash = rest.indexOf('/')
    if (slash === -1) return null
    scope = `${rest.slice(0, slash)}/`
    rest = rest.slice(slash + 1)
  }

  const slash = rest.indexOf('/')
  const pkgAndVersion = slash === -1 ? rest : rest.slice(0, slash)
  const filePath = slash === -1 ? '' : rest.slice(slash + 1)
  const pkgName = pkgAndVersion.split('@')[0]

  return new URL(`../node_modules/${scope}${pkgName}/${filePath}`, import.meta.url).pathname
}
