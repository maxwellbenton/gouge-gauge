import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves project sites (as opposed to a <user>.github.io root
// site) from a /<repo-name>/ subpath, not the domain root — every asset
// reference, the PWA manifest's start_url/scope, and the router's basename
// all need to agree on that prefix or the deployed build 404s on its own
// assets. Set via an env var (rather than hardcoded) so `npm run dev` and
// `npm run build` for local testing still serve from '/' — only the
// GitHub Pages workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'GougeGauge',
        short_name: 'GougeGauge',
        description:
          'Scan a barcode, log the price, and see which store actually has the better deal.',
        theme_color: '#7c3aed',
        background_color: '#16171d',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + static assets get precached; data (IndexedDB) is handled
        // separately by the app itself, not the service worker cache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: {
        // Lets us test install/offline behavior during `npm run dev`, not just
        // in a production build.
        enabled: true,
      },
    }),
  ],
})
