import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Moon, Search, Sun, X } from 'lucide-react';
import { useFullPage } from '../../utils/fullPage';
import { PageLoading, Row, Section, useStuck } from './kit';
import { LoginApprovalRow } from './LoginApprovalRow';
import { ROWS, SECTIONS, searchRows, type RowDef } from './registry';
import { useFeaturesOff } from '../../utils/featureFlags';
import { PAGES } from './pages';
import { loadSettings, useAccountSettings, warmLists } from '../../services/settingsApi';
import type { SettingsContext } from './types';
import { getThemePreference, resolveTheme, setThemePreference, subscribeToTheme } from '../../utils/theme';

// Dark or light with one tap: the new mood is washed over the whole app by a circle that grows from the switch (the browser's own view transition; where there is none, or for people who
// asked for less motion, the mood just changes).
function changeMood(next: 'dark' | 'light', x: number, y: number): void {
  const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<unknown> } };
  const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || calm) { setThemePreference(next); return; }
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => setThemePreference(next));
  void transition.ready.then(() => {
    (document.documentElement as unknown as { animate: (k: unknown, o: unknown) => unknown }).animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 720, easing: 'cubic-bezier(.3, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  }).catch(() => undefined);
}

const MoodCard: React.FC = () => {
  const [mode, setMode] = useState<'dark' | 'light'>(() => resolveTheme(getThemePreference()));
  useEffect(() => subscribeToTheme((_pref, resolved) => setMode(resolved)), []);
  const flip = (e: React.MouseEvent<HTMLButtonElement>) => {
    const sw = e.currentTarget.querySelector('.nst-switch')?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect();
    changeMood(mode === 'dark' ? 'light' : 'dark', sw.left + sw.width / 2, sw.top + sw.height / 2);
    try { navigator.vibrate?.(8); } catch { /* not on this device */ }
  };
  return (
    <button type="button" className="nst-mood" data-mode={mode} onClick={flip} role="switch" aria-checked={mode === 'dark'} aria-label="Dark mode" data-testid="settings-mood">
      <span className="nst-orb"><Moon className="moon" /><Sun className="sun" /></span>
      <span className="nst-mood-text">
        <b>Dark mode</b>
        <small>{mode === 'dark' ? 'On: easy on the eyes. Tap to switch the mood.' : 'Off: the paper look. Tap to switch the mood.'}</small>
      </span>
      <span className="nst-switch" data-on={mode === 'dark'} aria-hidden="true"><i><svg viewBox="0 0 16 16"><path d="M3.4 8.6 6.6 11.7 12.6 4.7" /></svg></i></span>
    </button>
  );
};

// "Settings and activity": a full-screen page opened from the profile's three dots. The first screen is the list of everything (with a search box); each row opens its own page,
// and some pages open more pages. It is a stack of pages like any other in the app: the phone's back button, a back swipe and the Back arrow all go up one page, and from the
// first screen they close Settings. Pages are loaded the first time they are opened.

// There is only ever one hub. These count the hubs on screen and the history entries it added that are still there, so that when it goes away for any reason (a button,
// a link out, logging out) the entries are taken off again and the phone's Back button does not land on a page that is no longer there.
let liveHubs = 0;
let ownedEntries = 0;

export const SettingsHub: React.FC<{ ctx: SettingsContext; onClose: () => void }> = ({ ctx: parentCtx, onClose }) => {
  const [stack, setStack] = useState<string[]>([]);       // [] = the first screen
  const [query, setQuery] = useState('');
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const pushed = useRef(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [mark, stuck] = useStuck();
  const lastDepth = useRef(0);
  const settings = useAccountSettings();
  useFullPage(true);

  useEffect(() => { void loadSettings(); warmLists(); }, []);

  // history: one entry for the first screen and one for each page opened on top, so Back always means "one page up"
  useEffect(() => {
    liveHubs++;
    if (!pushed.current) {
      pushed.current = true;
      try { window.history.pushState({ noobSettings: 1 }, ''); ownedEntries = 1; } catch { /* no history: the on-screen Back still works */ }
    }
    const onPop = (e: PopStateEvent) => {
      const depth = Number((e.state as { noobSettings?: number } | null)?.noobSettings || 0);
      ownedEntries = Math.max(0, depth);
      if (depth <= 0) { onClose(); return; }
      setStack((s) => (s.length > depth - 1 ? s.slice(0, depth - 1) : s));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      liveHubs--;
      // Gone without Back being pressed: take our entries off, unless something else was opened after them (then they stay, harmless)
      window.setTimeout(() => {
        if (liveHubs > 0 || ownedEntries <= 0) return;
        const n = ownedEntries;
        ownedEntries = 0;
        try { if ((window.history.state as { noobSettings?: number } | null)?.noobSettings) window.history.go(-n); } catch { /* not important */ }
      }, 0);
    };
  }, [onClose]);

  const go = useCallback((page: string) => {
    if (!PAGES[page]) return;
    try { window.history.pushState({ noobSettings: stackRef.current.length + 2 }, ''); ownedEntries = stackRef.current.length + 2; } catch { /* not important */ }
    setStack((s) => [...s, page]);
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length === 0 && !pushed.current) { onClose(); return; }
    try { window.history.back(); } catch { if (stackRef.current.length === 0) onClose(); else setStack((s) => s.slice(0, -1)); }
  }, [onClose]);

  // pages and rows that leave Settings (show the Saved tab, log out...) use this to close it: all of its history entries go with it
  const closeAll = useCallback(() => {
    const n = ownedEntries;
    if (n > 0) { try { window.history.go(-n); return; } catch { /* fall through */ } }
    onClose();
  }, [onClose]);
  const ctx = useMemo<SettingsContext>(() => ({ ...parentCtx, actions: { ...parentCtx.actions, close: closeAll } }), [parentCtx, closeAll]);

  // every page starts at its top
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [stack.length]);
  // going deeper slides the next page in from the right, going back slides it in from the left
  const goingBack = stack.length < lastDepth.current;
  useEffect(() => { lastDepth.current = stack.length; }, [stack.length]);

  // Escape = Back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const featuresOff = useFeaturesOff();   // the support assistant is not listed (or found by search) while the administrator has it switched off
  const rows = useMemo(() => ROWS.filter((r) => (!r.page || PAGES[r.page]) && (!r.show || r.show(ctx)) && !(r.action === 'openSupport' && featuresOff.has('support')) && !(r.action === 'openSuggestionBox' && featuresOff.has('suggestions'))), [ctx, featuresOff]);
  const found = useMemo(() => searchRows(rows, query.trim()), [rows, query]);

  const valueOf = (r: RowDef): string | undefined => {
    if (r.value) return r.value(ctx);
    void settings;
    return undefined;
  };

  const press = (r: RowDef) => {
    if (r.page) { go(r.page); return; }
    if (r.action === 'showProfileTab') { ctx.actions.showProfileTab('saved'); ctx.actions.close(); return; }
    if (r.action) (ctx.actions[r.action] as () => void)();
  };

  const renderRow = (r: RowDef) => r.toggle === 'login-approval' ? <LoginApprovalRow key={r.id} /> : (
    <Row key={r.id} icon={r.icon} label={r.label} sub={r.sub} value={valueOf(r)} danger={r.danger} onClick={() => press(r)} testId={`row-${r.id}`} />
  );

  const current = stack[stack.length - 1];
  const Page = current ? PAGES[current] : null;

  let section = 0;
  const view = (
    <div ref={scroller} className="nst-root fixed inset-0 z-[45] bg-page doodle-wallpaper overflow-y-auto text-white" role="region" aria-label="Settings and activity" data-testid="settings-hub">
      {Page ? (
        <Suspense fallback={<PageLoading />}>
          <div key={current} className={`nst-page${goingBack ? ' back' : ''}`}><Page ctx={ctx} go={go} back={back} /></div>
        </Suspense>
      ) : (
        <div className={`min-h-full nst-page${goingBack ? ' back' : ''}`}>
          <div ref={mark} className="h-px -mb-px" aria-hidden="true" />
          <header className={`nst-header${stuck ? ' is-stuck' : ''}`}>
            <div className="nst-header-in">
              <button type="button" onClick={back} aria-label="Back" data-testid="settings-back" className="nst-back">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="nst-htitle nst-late">Settings and activity</h1>
            </div>
          </header>
          <div className="nst-body">
            <div className="nst-hero">
              <h2 className="nst-big">Settings</h2>
              <svg className="nst-squiggle" viewBox="0 0 120 12" aria-hidden="true"><path d="M3 7c7-7 12-7 19 0s12 7 19 0 12-7 19 0 12 7 19 0 12-7 19 0" /></svg>
              <p>Your account, your look, your rules, and everything you did on NOOB.</p>
            </div>
            <label className="nst-search">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
                data-testid="settings-search"
              />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="nst-clear"><X className="w-4 h-4" /></button>}
            </label>

            {!query.trim() && <MoodCard />}

            {query.trim() ? (
              found.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-14">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
              ) : (
                <Section index={0} title={`${found.length} result${found.length === 1 ? '' : 's'}`}>{found.map(renderRow)}</Section>
              )
            ) : (
              SECTIONS.map((title) => {
                const list = rows.filter((r) => r.section === title);
                return list.length ? <Section key={title} index={section++} title={title}>{list.map(renderRow)}</Section> : null;
              })
            )}
            <p className="text-center text-[11px] text-zinc-600 pt-9">NOOB Socials &middot; run by students</p>
          </div>
        </div>
      )}
    </div>
  );

  return view;
};

