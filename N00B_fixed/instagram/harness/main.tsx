// @ts-nocheck
// NOOB visual harness (dev only, see harness/README.md): renders signed-in pages with a fake login and a fake backend.
// Order matters: the fake login and the fake fetch are installed FIRST, the app's own modules are imported afterwards (dynamic imports below).
import { FAKE_USER_ID, makeUser, rpcMocks, tableMocks } from './mocks';

const q = new URLSearchParams(window.location.search);
const page = q.get('page') || 'menu';
const theme = q.get('theme') === 'light' ? 'light' : 'dark';
const phone = q.get('phone') === '1';
const state = (['full', 'empty', 'loading', 'error'].includes(q.get('state') || '') ? q.get('state') : 'full') as 'full' | 'empty' | 'loading' | 'error';
const admin = q.get('admin') === '1';
const voted = q.get('voted') === '1';
const target = q.get('target') || undefined;
const signedOut = q.get('user') === '0';
const user = makeUser(admin);

// ---- 1. what public/theme-init.js and the phone-edge rules do in the real app
const root = document.documentElement;
try { localStorage.setItem('noob_theme', theme); } catch { /* storage blocked */ }
root.setAttribute('data-theme', theme);
root.setAttribute('data-theme-pref', theme);
if (phone) {
  root.classList.add('phone-edge');                       // the page is drawn under the clock; html.phone-edge rules in src/index.css
  root.style.setProperty('--h-sat', '47px');              // env(safe-area-inset-top) / bottom are rewritten to these by vite.harness.config.ts
  root.style.setProperty('--h-sab', '34px');
  root.style.setProperty('--safe-area-inset-top', '47px');
  root.style.setProperty('--sat', '47px');
}
document.body.classList.toggle('light', theme === 'light');
try { localStorage.setItem('noob.devicePrefs.v1', JSON.stringify(q.get('doodle') === '0' ? { doodleBackground: false } : {})); } catch { /* storage blocked */ }   // &doodle=0 = the app's own "doodle background" switch off (utils/devicePrefs.ts)
//   // hides the faint wallpaper pattern behind pages (the app's own switch)

// ---- 2. a fake, non-expired login in the place the app reads it (src/services/tabSessions.ts)
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
const accessToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: FAKE_USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.harness`;
const authUser = { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: { username: user.username }, created_at: new Date(Date.now() - 400 * 864e5).toISOString() };
const session = { access_token: accessToken, token_type: 'bearer', expires_in: 10 * 365 * 24 * 3600, expires_at: exp, refresh_token: 'harness-refresh-token', user: authUser };
try {
  if (!signedOut) {
    localStorage.setItem(`noob_session_v1_${FAKE_USER_ID}`, JSON.stringify(session));
    localStorage.setItem('noob_last_account_v1', FAKE_USER_ID);
    sessionStorage.setItem('noob_tab_account_v1', FAKE_USER_ID);
  } else {
    localStorage.removeItem(`noob_session_v1_${FAKE_USER_ID}`);
    sessionStorage.setItem('noob_tab_account_v1', '');
  }
} catch { /* storage blocked: the pages then see no login */ }

// ---- 3. the fake backend: every request to the Supabase host is answered here
const SB = String(import.meta.env.VITE_SUPABASE_URL || 'https://harness.invalid').replace(/\/+$/, '');
const realFetch = window.fetch.bind(window);
const ctx = { state, admin, voted, user };
const NEVER = ['fun_can_manage', 'get_app_settings', 'is_account_suspended', 'form_role', 'ask_my_settings'];   // not delayed / failed by ?state=
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body ?? null), { status, headers: { 'content-type': 'application/json', ...headers } });
const warned = new Set<string>();
const warn = (kind: string, name: string) => { const k = kind + name; if (!warned.has(k)) { warned.add(k); console.warn(`[harness] no mock for ${kind} "${name}"`); } };
(window as any).__harnessLog = [];

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const href = req ? req.url : String(input);
  if (!href.startsWith(SB)) return realFetch(input as any, init);
  const url = new URL(href);
  const method = (init?.method || req?.method || 'GET').toUpperCase();
  const path = url.pathname;
  let body: any = init?.body ?? undefined;
  if (req && body === undefined) { try { body = await req.clone().text(); } catch { body = undefined; } }
  let args: any = {};
  if (typeof body === 'string' && body) { try { args = JSON.parse(body); } catch { args = {}; } }
  const headers = new Headers(init?.headers || req?.headers || {});
  (window as any).__harnessLog.push(`${method} ${path}${url.search}`);

  if (path.startsWith('/auth/v1/')) {
    if (path.endsWith('/logout')) return json(null, 204);
    if (path.endsWith('/user')) return json(authUser);
    if (path.endsWith('/token')) return json(session);
    return json({});
  }
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = decodeURIComponent(path.slice('/rest/v1/rpc/'.length));
    const mock = rpcMocks[fn];
    if (!NEVER.includes(fn)) {
      if (state === 'loading') return new Promise<Response>(() => undefined);
      if (state === 'error') return json({ message: 'Harness: forced error (?state=error)', code: 'HX000', details: null, hint: null }, 500);
    }
    if (!mock) { warn('rpc', fn); return json(null); }
    try { return json(mock(args, ctx) ?? null); } catch (e) { console.error('[harness] mock for rpc "' + fn + '" threw', e); return json({ message: 'Harness mock threw: ' + (e as Error).message, code: 'HX001' }, 500); }
  }
  if (path.startsWith('/rest/v1/')) {
    const table = decodeURIComponent(path.slice('/rest/v1/'.length));
    if (state === 'loading') return new Promise<Response>(() => undefined);
    if (state === 'error') return json({ message: 'Harness: forced error (?state=error)', code: 'HX000' }, 500);
    if (method !== 'GET' && method !== 'HEAD') return json(Array.isArray(args) ? args : [args], method === 'POST' ? 201 : 200);
    const mock = tableMocks[table];
    if (!mock) { warn('table', table); return json([]); }
    const rows = mock(url.searchParams, ctx) || [];
    if (/vnd\.pgrst\.object/.test(headers.get('accept') || '')) return rows.length ? json(rows[0]) : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }, 406);
    return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  }
  if (path.startsWith('/functions/v1/')) { warn('function', path.slice('/functions/v1/'.length)); return json({}); }
  if (path.startsWith('/storage/v1/')) return json({ message: 'Harness: storage is not available' }, 404);
  warn('request', method + ' ' + path);
  return json({}, 404);
};

// ---- 4. the app itself (imported only now, so it sees the fake login and the fake fetch)
async function boot() {
  await import('@fontsource/dejavu-sans/latin-400.css');
  await import('@fontsource/dejavu-sans/latin-700.css');
  await import('../src/index.css');
  await import('../src/polish.css');
  await import('../src/utils/devicePrefs.ts');
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { initTheme } = await import('../src/utils/theme.ts');
  const { installPageFrames } = await import('../src/utils/pageFrames.ts');
  const { startTextFit } = await import('../src/utils/textFit.ts');
  const { initLanguage } = await import('../src/i18n/engine.ts');
  const { ErrorBoundary } = await import('../src/components/ErrorBoundary.tsx');
  const { MusicPlayerProvider } = await import('../src/context/MusicPlayerContext.tsx');
  // Screenshots: by default every CSS animation / transition jumps to its end state (an entrance animation caught half-way looks washed out). &anim=1 keeps them running.
  if (q.get('anim') !== '1') {
    const still = document.createElement('style');
    still.textContent = '*,*::before,*::after{animation-duration:0.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important}';
    document.head.appendChild(still);
  }
  installPageFrames();
  initTheme();
  void initLanguage();
  startTextFit();

  const el = document.getElementById('root')!;
  const noop = () => undefined;
  const h = React.createElement;
  const currentUser = signedOut ? null : user;

  const Menu = () => {
    const pages = [['draw', 'NOOB Draw'], ['tot', 'This or That'], ['ask', 'Ask Me Anything (inbox)'], ['ask&target=priya.nair', 'Ask Me Anything (someone\'s page)'], ['polls', 'Public Polls'], ['anon', 'Anonymous Messages'], ['studio', 'NOOB Studio'], ['forms', 'NOOB Forms (my forms)'], ['form', 'NOOB Forms (public form)']];
    return h('div', { style: { padding: 20, fontFamily: 'sans-serif', color: theme === 'light' ? '#111' : '#eee' } },
      h('h2', null, 'NOOB visual harness'),
      h('p', null, 'Add &theme=light|dark &phone=1 &state=full|empty|loading|error &admin=1 &voted=1 &user=0 to any link.'),
      ...pages.map(([p, label]) => h('p', { key: p }, h('a', { href: `?page=${p}&theme=${theme}${phone ? '&phone=1' : ''}`, style: { color: 'inherit', textDecoration: 'underline' } }, label))));
  };


  let Page: any = Menu;
  if (page === 'draw') {
    const { NoobDrawPage } = await import('../src/components/Draw/NoobDrawPage.tsx');
    Page = () => { const [me, setMe] = React.useState(currentUser); return h(NoobDrawPage, { currentUser: me, onUserUpdated: setMe, onClose: () => console.info('[harness] onClose') }); };
  } else if (['tot', 'ask', 'polls', 'forms', 'form'].includes(page)) {
    const { FunHub } = await import('../src/components/Fun/FunHub.tsx');
    const feature = { tot: 'this-or-that', ask: 'ask', polls: 'polls', forms: 'forms', form: 'form' }[page];
    Page = () => {
      const [loc, setLoc] = React.useState({ feature, target: target ?? (page === 'form' ? 'cs-f1' : undefined) });
      return h(FunHub, { currentUser, location: loc, onNavigate: setLoc, onBack: () => console.info('[harness] onBack'), onHome: () => console.info('[harness] onHome'), onLogin: () => console.info('[harness] onLogin'), onOpenProfile: (u) => console.info('[harness] onOpenProfile', u?.username) });
    };
  } else if (page === 'anon') {
    const mod = await import('../src/components/Anonymous/AnonymousMessagesPage.tsx');
    const AnonymousMessagesPage = mod.AnonymousMessagesPage || mod.default;
    Page = () => h(AnonymousMessagesPage, { currentUser, onClose: () => console.info('[harness] onClose'), onLogin: () => console.info('[harness] onLogin') });
  } else if (page === 'studio') {
    const mod = await import('../src/components/Studio/StudioApp.tsx');
    const StudioApp = mod.StudioApp || mod.default;
    const media = q.get('media') || 'image';
    const files: File[] = [];
    try {
      if (media === 'image') {
        const blob = await (await realFetch('/screens/noob-socials-feed-post.jpg')).blob();
        files.push(new File([blob], 'sample-photo.jpg', { type: blob.type || 'image/jpeg' }));
      } else if (media === 'video') {
        files.push(await makeSampleVideo());
      }
    } catch (e) { console.warn('[harness] could not make the sample media', e); }
    Page = () => h(StudioApp, { initialFiles: files, onClose: () => console.info('[harness] onClose'), onUse: (f, t) => console.info('[harness] onUse', f.name, t) });
  }

  createRoot(el).render(h(ErrorBoundary, null, h(MusicPlayerProvider, null, h(Page))));
}

// a 3 s clip drawn on a canvas, so NOOB Studio can be looked at with a video loaded (?media=video)
async function makeSampleVideo(): Promise<File> {
  const c = document.createElement('canvas'); c.width = 540; c.height = 960;
  const g = c.getContext('2d')!;
  const stream = c.captureStream(24);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const grad = g.createLinearGradient(0, 0, 540, 960); grad.addColorStop(0, `hsl(${(t * 60) % 360},80%,55%)`); grad.addColorStop(1, `hsl(${(t * 60 + 120) % 360},80%,35%)`);
      g.fillStyle = grad; g.fillRect(0, 0, 540, 960);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(270 + Math.cos(t * 3) * 150, 480 + Math.sin(t * 3) * 220, 70, 0, 7); g.fill();
      g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText('NOOB', 270, 140);
      if (t < 3) requestAnimationFrame(tick); else resolve();
    };
    tick();
  });
  rec.stop(); await done;
  return new File([new Blob(chunks, { type: 'video/webm' })], 'sample-clip.webm', { type: 'video/webm' });
}

void boot();
