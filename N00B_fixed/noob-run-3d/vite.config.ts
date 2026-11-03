import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base keeps the production output portable (it is served from /games/noob-run-3d/); scripts, style and fonts get a fingerprint and live in build/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000, sourcemap: false, rollupOptions: { output: { entryFileNames: 'build/[name]-[hash].js', chunkFileNames: 'build/[name]-[hash].js', assetFileNames: 'build/[name]-[hash][extname]' } } },
})
