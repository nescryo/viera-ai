import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the app shell plus the Live2D model files (moc3, JSON, WebP
      // textures) so a full page reload (F5) serves them from the Cache Storage
      // instead of the network.
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp}',
          'models/deepseek-chan/**/*.{moc3,json}'
        ],
        globIgnores: [
          // Preview image next to the model; the runtime never loads it.
          'models/deepseek-chan/*.png',
          // Editor/VTuber tooling files the runtime never loads.
          'models/deepseek-chan/*.vtube.json',
          'models/deepseek-chan/items_pinned_to_model.json'
        ],
        // The largest cached file is the .moc3 (~16 MB).
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024
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
