import { defineConfig } from 'vitest/config'

// Underhall: After Curfew. The game's own files (models, textures, audio, fonts) are in vendor/super-dungeon/public and are copied as they are.
export default defineConfig({
  base: './',
  publicDir: 'vendor/super-dungeon/public',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  test: { environment: 'node', include: ['vendor/super-dungeon/tests/**/*.test.ts'] },
})
