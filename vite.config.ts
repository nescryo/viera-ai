import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
