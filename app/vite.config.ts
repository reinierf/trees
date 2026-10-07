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
      // Dev counterpart of public/.htaccess: serve the app at place paths (/rotterdam). Production
      // fills in the page's tags there (api/page.php); in dev every path gets the default ones.
      name: 'place-paths',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const m = /^\/((?!api\b)[a-z][a-z0-9-]*)(\/?)(\?.*)?$/i.exec(req.url ?? '')
          if (m && m[2]) {
            // /rotterdam/ → /rotterdam, as in production
            res.statusCode = 302
            res.setHeader('Location', `/${m[1]}${m[3] ?? ''}`)
            res.end()
            return
          }
          if (m) req.url = '/'
          next()
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
