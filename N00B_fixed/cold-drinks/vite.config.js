import { defineConfig } from 'vite';

// The built site goes straight into the app's public folder, so the app serves it at /cold-drinks/. Every file in assets/ gets a code in its name (they are kept for a year by browsers).
export default defineConfig({
  base: './',
  build: {
    outDir: process.env.COLD_DRINKS_OUT || '../instagram/public/cold-drinks',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900
  },
  server: { port: 5190, host: '127.0.0.1' }
});
