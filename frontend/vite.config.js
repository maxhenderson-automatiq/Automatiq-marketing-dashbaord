import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load .env.local so we can use tokens in the proxy config (Node-side only)
  const env = loadEnv(mode, '../', 'VITE_')

  return {
    plugins: [react()],

    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            router: ['react-router-dom'],
            charts: ['recharts'],
            query: ['@tanstack/react-query'],
          },
        },
      },
    },

    server: {
      proxy: {
        // ── HubSpot ─────────────────────────────────────────────────────────
        // Browser calls /proxy/hubspot/... → Vite Node process rewrites to
        // https://api.hubapi.com/... and injects the Bearer token.
        // Token lives in .env.local (gitignored), never in the JS bundle.
        '/proxy/hubspot': {
          target: 'https://api.hubapi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/hubspot/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader(
                'Authorization',
                `Bearer ${env.VITE_HUBSPOT_ACCESS_TOKEN}`
              )
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },

        // ── Pendo ────────────────────────────────────────────────────────────
        '/proxy/pendo': {
          target: 'https://app.pendo.io',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/proxy\/pendo/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader(
                'x-pendo-integration-key',
                env.VITE_PENDO_INTEGRATION_KEY
              )
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
      },
    },
  }
})
