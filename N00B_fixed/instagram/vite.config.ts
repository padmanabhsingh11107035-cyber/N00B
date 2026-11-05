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
          // and so is the Family Map (family.html, the address /family)
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/family(\?|#|$)/.test(req.url)) req.url = '/family.html' + req.url.slice('/family'.length); next(); });
        },
        configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/lenses(\?|$)/.test(req.url)) req.url = '/lenses.html' + req.url.slice('/lenses'.length); next(); });
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/booth(\?|$)/.test(req.url)) req.url = '/booth.html' + req.url.slice('/booth'.length); next(); });
          // and so is the Family Map (family.html, the address /family)
          server.middlewares.use((req, _res, next) => { if (req.url && /^\/family(\?|#|$)/.test(req.url)) req.url = '/family.html' + req.url.slice('/family'.length); next(); });
        }
      },
      {
        // A build whose main stylesheet has no layout classes (".flex", ".fixed", ".w-full" ...) would put an unstyled app on the website: it is refused here, so the
        // last good version stays online instead.
        name: 'refuse-unstyled-build',
        writeBundle(options: { dir?: string }) {
          const dir = path.join(options.dir || 'dist', 'assets');
          const css = fs.readdirSync(dir).filter((f) => /^main-.*\.css$/.test(f)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join(' ');
          const missing = ['.flex{', '.fixed{', '.w-full{', '.items-center{', '.rounded-full{'].filter((k) => !css.includes(k));
          if (css.length < 300000 || missing.length) throw new Error(`The main stylesheet is broken (${css.length} bytes, missing ${missing.join(' ')}): the build is refused so the website keeps its last good version.`);
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
    // What a person can download of the app is the built bundle, so it is built to give away as little as possible: no source maps (the original files and their names are not
    // shipped), no comments or licence banners, no debugger statements, and the plain console.log / debug / info lines are cut out. (A website's code can never be fully hidden from
    // the browser that runs it: what protects NOOB is that every rule is enforced in the database, see supabase/migrations and scripts/security-audit-db.mjs.)
    esbuild: { drop: ['debugger'] as ('debugger' | 'console')[], pure: ['console.log', 'console.debug', 'console.info'], legalComments: 'none' as const },
    build: {
      sourcemap: false,
      minify: 'esbuild' as const,
      rollupOptions: {
        // four pages: the app (index.html), NOOB Lenses (lenses.html), the Buddy Booth (booth.html) and the Family Map (family.html)
        input: { main: path.resolve(__dirname, 'index.html'), lenses: path.resolve(__dirname, 'lenses.html'), booth: path.resolve(__dirname, 'booth.html'), family: path.resolve(__dirname, 'family.html') }
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
