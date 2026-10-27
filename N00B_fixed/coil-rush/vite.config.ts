import { defineConfig } from 'vitest/config'

// Relative base keeps the production output portable (it is served from /games/coil-rush/).
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  // the script and style files get a fingerprint in their name and live in build/, so they can be kept by a browser for ever (pictures, sounds and fonts keep their names, under assets/)
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false, rollupOptions: { output: { entryFileNames: 'build/[name]-[hash].js', chunkFileNames: 'build/[name]-[hash].js', assetFileNames: 'build/[name]-[hash][extname]' } } },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
})
