import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Same forwarding as the price proxy Worker (worker/index.ts) does in production.
      '/api/chart/': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/chart\//, '/v8/finance/chart/'),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
      // Locally, Fear & Greed comes straight from CNN (the Worker trims it in production).
      '/api/fng': {
        target: 'https://production.dataviz.cnn.io',
        changeOrigin: true,
        rewrite: () => '/index/fearandgreed/graphdata',
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://edition.cnn.com/' },
      },
    },
  },
})
