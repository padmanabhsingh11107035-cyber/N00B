import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Relative base keeps the production output portable (it is served from /games/siegecraft/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    server: { host: env.HOST ?? '127.0.0.1', port, strictPort: true },
    // the script, style and model files get a fingerprint in their name and live in build/, so they can be kept by a browser for ever (fonts and the logo keep their names)
    build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false, rollupOptions: { output: { entryFileNames: 'build/[name]-[hash].js', chunkFileNames: 'build/[name]-[hash].js', assetFileNames: 'build/[name]-[hash][extname]' } } },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
