import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
