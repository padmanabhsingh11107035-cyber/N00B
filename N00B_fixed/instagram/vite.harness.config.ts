// DEV-ONLY visual harness (see harness/README.md). Not part of the production build: `npm run harness` serves it on port 5190.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// A desktop browser has no notch, so env(safe-area-inset-*) is always 0 there. In the harness every env(safe-area-inset-top / bottom) in the app's code and CSS
// is rewritten to var(--h-sat / --h-sab, <the original fallback>): with phone=1 the harness sets those two variables (47px / 34px, an iPhone 14), otherwise the
// original fallback applies and nothing changes.
const safeAreaEmulation = {
  name: 'harness-safe-area-env',
  enforce: 'post' as const,
  transform(code: string, id: string) {
    if (id.includes('node_modules') || !/\.(css|[jt]sx?)(\?|$)/.test(id) || !code.includes('safe-area-inset-')) return null;
    const out = code
      .replace(/env\(\s*safe-area-inset-top\s*,\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g, 'var(--h-sat, $1)')
      .replace(/env\(\s*safe-area-inset-top\s*\)/g, 'var(--h-sat, 0px)')
      .replace(/env\(\s*safe-area-inset-bottom\s*,\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g, 'var(--h-sab, $1)')
      .replace(/env\(\s*safe-area-inset-bottom\s*\)/g, 'var(--h-sab, 0px)');
    return out === code ? null : { code: out, map: null };
  }
};

export default defineConfig({
  root: __dirname,
  envDir: __dirname,
  plugins: [
    react(),
    tailwindcss(),
    safeAreaEmulation,
    { name: 'harness-open-address', configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.url === '/' || req.url?.startsWith('/?')) req.url = '/harness/index.html' + (req.url.slice(1) || ''); next(); }); } }
  ],
  define: { __BUILD_ID__: JSON.stringify('harness') },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  server: { port: 5190, strictPort: true, host: '127.0.0.1', hmr: true },
  optimizeDeps: { entries: ['harness/index.html'] }
});
