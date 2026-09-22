import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// PWA setup — see docs/pwa (or README) for context.
// - registerType: 'autoUpdate' → the SW checks for a new build every load and
//   swaps itself in without needing a reload prompt. Fine for a POS since the
//   API is the source of truth; a stale shell for one refresh doesn't hurt.
// - display: 'standalone' → installed app opens in its own window (no browser
//   chrome). This is what makes the desktop shortcut feel like a native app.
// - workbox.navigateFallback: return index.html for every SPA route so a
//   deep-linked route (e.g. /reports/bir) still boots offline once cached.
// - workbox.runtimeCaching → skip caching /api/* so API calls always go to
//   the network (a POS must not fake a sale from stale cache).
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyLab — Laboratory management',
        short_name: 'MyLab',
        description: 'MyLab — a tablet-friendly laboratory management workspace.',
        theme_color: '#dc2626',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything Vite emits (JS, CSS, HTML, images shipped by /public).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Default is 2 MiB; the LaboratoryView chunk is close, and the
        // vendor / index chunks are close-ish too. Anything over the limit
        // is SILENTLY skipped by workbox → offline navigation to that route
        // shows the Chrome "You're not connected" page. Bumping to 6 MiB
        // gives comfortable headroom without blowing up install size.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Purge stale precache entries from previous builds so the browser
        // doesn't accumulate them across deploys.
        cleanupOutdatedCaches: true,
        // Skip the "waiting" state — a new SW takes over as soon as it's
        // installed instead of only on the NEXT full page load. Combined
        // with clientsClaim, an update reaches open tabs immediately, so
        // an operator won't run a stale precache list against new code.
        skipWaiting: true,
        clientsClaim: true,
        // SPA fallback so any client-side route loads from cache when offline.
        navigateFallback: '/index.html',
        // API is server-authoritative — never cache /api or auth requests. A
        // stale cached "sale succeeded" would be catastrophic for a POS.
        navigateFallbackDenylist: [/^\/api\//, /^\/public\//],
        runtimeCaching: [
          // Safety net for lazy-loaded route chunks: if precache misses a
          // JS/CSS asset (over the size cap, race with a new deploy, etc.),
          // still serve from cache once it's been fetched once. Cache-first
          // is safe here because Vite fingerprints filenames — a new build
          // publishes new filenames, so we can't serve a stale JS by mistake.
          {
            urlPattern: /\/assets\/.+\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts: cache the stylesheet + font files so the app looks
          // right even when Google is unreachable. Fonts change rarely.
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Enabled so the install prompt (beforeinstallprompt) fires during
        // `npm run dev`. Chrome only offers install when a service worker is
        // active — without this the "Install as app" button never appears
        // during local development.
        //
        // `type: 'module'` uses the modern ESM service worker Vite supports,
        // which coexists cleanly with HMR — the SW doesn't intercept the
        // dev-server virtual assets, only the built output.
        enabled: true,
        type: 'module',
        // navigateFallback matters at dev time too — SPA deep links (e.g.
        // /reports/summary) need to boot through index.html.
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})
