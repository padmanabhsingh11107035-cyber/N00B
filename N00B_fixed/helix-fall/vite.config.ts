import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
})
