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
        // SPA fallback so any client-side route loads from cache when offline.
        navigateFallback: '/index.html',
        // API is server-authoritative — never cache /api or auth requests. A
        // stale cached "sale succeeded" would be catastrophic for a POS.
        navigateFallbackDenylist: [/^\/api\//, /^\/public\//],
        runtimeCaching: [
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
