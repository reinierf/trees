import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => ({
  // Use relative asset URLs in production so the app can be served from a subfolder.
  base: mode === 'production' ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'watch-map',
      configureServer(server) {
        server.watcher.add(path.resolve(__dirname, '../map'))
      },
    },
    {
      // Dev counterpart of public/.htaccess: /rotterdam → /#/rotterdam, the app's place link.
      // 302 rather than production's 301, so browsers don't cache it while developing.
      name: 'place-path-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const m = /^\/([a-z][a-z0-9-]+)\/?(\?.*)?$/.exec(req.url ?? '')
          if (!m || m[1] === 'api') return next()
          res.statusCode = 302
          res.setHeader('Location', `/#/${m[1]}`)
          res.end()
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'leaflet-vendor': ['leaflet', 'leaflet.markercluster'],
          'ui-vendor': ['radix-ui', 'lucide-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
