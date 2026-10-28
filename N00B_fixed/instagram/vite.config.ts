import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// A person on an iPhone home-screen PWA (or any tab left open across a deploy) can keep running
// the JS from before a fix indefinitely — reopening the app icon on iOS very often just resumes
// the suspended page in memory instead of reloading it, so nothing they do in the UI ever picks
// up a new build. This stamps every build with a unique id, baked into the bundle itself and also
// written to a small static version.json the running app can re-fetch and compare against, so it
// can tell the person a new version is ready instead of silently staying stale forever.
const buildId = String(Date.now());

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // NOOB Lenses is a page of its own (lenses.html, no app inside): the address /lenses opens it, here while developing and in the preview as it does on the website (Cloudflare serves lenses.html there)
        name: 'lenses-page-address',
        configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/lenses(\?|$)/.test(req.url)) req.url = '/lenses.html' + req.url.slice('/lenses'.length); next(); });
          // the Buddy Booth is a page of its own too (booth.html, the address /booth)
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/booth(\?|$)/.test(req.url)) req.url = '/booth.html' + req.url.slice('/booth'.length); next(); });
        },
        configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/lenses(\?|$)/.test(req.url)) req.url = '/lenses.html' + req.url.slice('/lenses'.length); next(); });
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/booth(\?|$)/.test(req.url)) req.url = '/booth.html' + req.url.slice('/booth'.length); next(); });
        }
      },
      {
        name: 'write-build-version',
        writeBundle(options: { dir?: string }) {
          const outDir = options.dir || 'dist';
          fs.writeFileSync(path.resolve(outDir, 'version.json'), JSON.stringify({ buildId }));
        }
      }
    ],
    define: {
      __BUILD_ID__: JSON.stringify(buildId)
    },
    build: {
      rollupOptions: {
        // three pages: the app (index.html), NOOB Lenses (lenses.html) and the Buddy Booth (booth.html)
        input: { main: path.resolve(__dirname, 'index.html'), lenses: path.resolve(__dirname, 'lenses.html'), booth: path.resolve(__dirname, 'booth.html') }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
