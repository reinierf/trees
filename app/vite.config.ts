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
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
}))
