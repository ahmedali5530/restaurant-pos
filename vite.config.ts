import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // QR self-order page (order.html) calls /self-order/* on its own origin so
  // customers' phones only need to reach this web server.
  const gatewayTarget = env.SELF_ORDER_GATEWAY_URL || env.VITE_GATEWAY_URL || 'http://localhost:3142'

  return {
    server: {
      proxy: {
        '/self-order': { target: gatewayTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        '/self-order': { target: gatewayTarget, changeOrigin: true },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'generateSW',
        includeAssets: ['favicon-32.png', 'pwa-192.png', 'pwa-512.png', 'vite.svg'],
        manifest: {
          name: 'Restaurant POS',
          short_name: 'POS',
          description: 'Restaurant point of sale — works offline after first load',
          theme_color: '#1a1a1a',
          background_color: '#fdfdfd',
          display: 'standalone',
          start_url: '/',
          scope: '/',
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
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // The customer QR menu is a separate page; never serve the POS shell for it.
          navigateFallbackDenylist: [/^\/order\.html/, /^\/self-order\//],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webp}'],
          globIgnores: ['**/stats.html'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/auth/') ||
                url.pathname.startsWith('/sync/') ||
                url.pathname.startsWith('/self-order/') ||
                url.port === '3142' ||
                url.pathname.includes('/rpc'),
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      visualizer({
        filename: './dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") }
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          order: path.resolve(__dirname, 'order.html'),
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (
              id.includes('/antd/') ||
              id.includes('\\antd\\') ||
              id.includes('@rc-component') ||
              id.includes('@ant-design')
            ) {
              return 'antd'
            }
            if (
              id.includes('/react-dom/') ||
              id.includes('\\react-dom\\') ||
              id.includes('/react/') ||
              id.includes('\\react\\')
            ) {
              // Only core react packages, not react-* siblings
              if (
                /node_modules[/\\]react[/\\]/.test(id) ||
                /node_modules[/\\]react-dom[/\\]/.test(id) ||
                /node_modules[/\\]scheduler[/\\]/.test(id)
              ) {
                return 'react-vendor'
              }
            }
          },
        },
      },
    },
  }
})
