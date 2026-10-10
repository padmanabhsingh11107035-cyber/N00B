// The app's colour theme: Dark, Light, or System (follows the device's own light/dark setting, live).
// The choice is remembered per device under "noob_theme". index.html runs the same logic before the first paint
// so there is no flash of the wrong colours; this module takes over from there.

export type ThemePreference = 'dark' | 'light' | 'system';

const KEY = 'noob_theme';
const THEME_COLOR = { dark: '#262624', light: '#faf9f5' } as const;

let memoryPreference: ThemePreference = 'system'; // used only if the browser blocks storage

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  } catch {
    return memoryPreference;
  }
  return 'system';
}

const systemPrefersDark = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function resolveTheme(preference: ThemePreference = getThemePreference()): 'dark' | 'light' {
  return preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
}

type Listener = (preference: ThemePreference, resolved: 'dark' | 'light') => void;
const listeners = new Set<Listener>();

export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const preference = getThemePreference();
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', preference);
  // older rules in the app key off a "light" class on <body>
  document.body?.classList.toggle('light', resolved === 'light');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLOR[resolved]);
  listeners.forEach((fn) => fn(preference, resolved));
}

export function setThemePreference(preference: ThemePreference): void {
  memoryPreference = preference;
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  applyTheme();
}

export function subscribeToTheme(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let started = false;
/** Call once at start-up: applies the saved choice and keeps "System" in step with the device. */
export function initTheme(): void {
  if (started) return;
  started = true;
  applyTheme();
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getThemePreference() === 'system') applyTheme();
    };
    if (query.addEventListener) query.addEventListener('change', onChange);
    else if ((query as any).addListener) (query as any).addListener(onChange);
  }
  // another tab changed it
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) applyTheme();
  });
}
