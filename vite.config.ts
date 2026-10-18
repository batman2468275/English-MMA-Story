import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' makes the built site work from any sub-path (GitHub Pages, Vercel, Netlify, a folder…)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { headers: { 'Cache-Control': 'no-store' } },
  build: {
    chunkSizeWarningLimit: 1500,
    target: 'es2020',
  },
})
