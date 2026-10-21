import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // SPA は LP (`/`) と新コンソール (`/console`, BasicAuth) の 2 マウントポイントで
  // 同じバンドルを共有する。どこから読まれても assets を解決できるよう root-relative にする。
  // 旧 `/config` は Phase 2.7 で 301 → /console に永続リダイレクトしたため scope から外す。
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      scope: '/console',
      manifest: {
        name: 'Proxy Nostr Relay',
        short_name: 'NostrRelay',
        description: 'Nostr Proxy Relay Admin Console',
        theme_color: '#1a1d23',
        background_color: '#111217',
        display: 'standalone',
        start_url: '/console/',
        // 末尾スラッシュなしにする。ルーターの basename が '/console' なので、ホームへのリンクは
        // '/console' になる。scope が '/console/' だとそれが「範囲外」と判定され、Android の PWA が
        // ブラウザのバー（× と URL）を出して別タブのような表示になっていた。
        scope: '/console',
        // Nostr クライアントの「共有」から npub / note を受け取る（#55）。
        // GET なので Service Worker での処理は不要。/console/share がパレットに貼った状態で開く。
        share_target: {
          action: '/console/share',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        // 多くのブラウザは SVG アイコンを受け付ける。`any` と `maskable` を
        // 別エントリで宣言しておくと、Android のアダプティブアイコン枠が正しく
        // 切り取られ、デスクトップ PWA のホーム枠でも縁が欠けない。
        // PNG 192/512 が必要になった場合は別途生成して追記する。
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
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
