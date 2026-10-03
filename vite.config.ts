import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the app shell plus the large 3D model/texture assets so a full
      // page reload (F5) serves them from the Cache Storage instead of the
      // network. These assets are large but rarely change.
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp}',
          '**/*.{pmx,bmp,txt}'
        ],
        // The character + stage models total ~25 MB; raise the per-file precache
        // limit so the PMX/texture files are not skipped.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('node_modules/three-stdlib')) {
            return 'three-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide-icons';
          }
        }
      }
    }
  },
  server: {
    proxy: {
      '/fish_audio_api': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/fish_audio_api/, '')
      }
    }
  }
})
