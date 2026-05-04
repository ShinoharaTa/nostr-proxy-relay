import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // SPA は LP (`/`)・新コンソール (`/console`, BasicAuth)・旧 admin (`/config`, BasicAuth)
  // の 3 マウントポイントから同じバンドルを共有する。どこから読まれても assets を解決できるよう
  // root-relative なパスにしておく。
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      scope: '/config/',
      manifest: {
        name: 'Proxy Nostr Relay',
        short_name: 'NostrRelay',
        description: 'Nostr Proxy Relay Admin Panel',
        theme_color: '#1a1d23',
        background_color: '#111217',
        display: 'standalone',
        start_url: '/config/',
        scope: '/config/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
