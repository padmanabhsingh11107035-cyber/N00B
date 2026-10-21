import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useFullPage } from '../../utils/fullPage';
import { PageLoading, Row, Section } from './kit';
import { LoginApprovalRow } from './LoginApprovalRow';
import { ROWS, SECTIONS, searchRows, type RowDef } from './registry';
import { PAGES } from './pages';
import { loadSettings, useAccountSettings, warmLists } from '../../services/settingsApi';
import type { SettingsContext } from './types';

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

  // Escape = Back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const rows = useMemo(() => ROWS.filter((r) => (!r.page || PAGES[r.page]) && (!r.show || r.show(ctx))), [ctx]);
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

  const view = (
    <div ref={scroller} className="fixed inset-0 z-[45] bg-page doodle-wallpaper overflow-y-auto text-white" role="region" aria-label="Settings and activity" data-testid="settings-hub">
      {Page ? (
        <Suspense fallback={<PageLoading />}>
          <div key={current} className="animate-in fade-in duration-150"><Page ctx={ctx} go={go} back={back} /></div>
        </Suspense>
      ) : (
        <div className="min-h-full">
          <header className="sticky top-0 z-10 bg-page/95 backdrop-blur-md border-b border-white/10">
            <div className="max-w-2xl mx-auto px-3 sm:px-4 h-16 flex items-center gap-3">
              <button type="button" onClick={back} aria-label="Back" data-testid="settings-back" className="w-10 h-10 shrink-0 rounded-full border border-white/25 bg-zinc-900/90 hover:border-white/60 flex items-center justify-center text-white cursor-pointer transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-black tracking-tight truncate">Settings and activity</h1>
            </div>
          </header>
          <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-24">
            <label className="relative block mt-4">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
                data-testid="settings-search"
                className="w-full bg-zinc-900/95 border border-white/15 focus:border-white/50 rounded-full pl-11 pr-10 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>}
            </label>

            {query.trim() ? (
              found.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-14">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
              ) : (
                <Section title={`${found.length} result${found.length === 1 ? '' : 's'}`}>{found.map(renderRow)}</Section>
              )
            ) : (
              SECTIONS.map((title) => {
                const list = rows.filter((r) => r.section === title);
                return list.length ? <Section key={title} title={title}>{list.map(renderRow)}</Section> : null;
              })
            )}
            <p className="text-center text-[11px] text-zinc-600 pt-8">NOOB Socials &middot; run by students</p>
          </div>
        </div>
      )}
    </div>
  );

  return view;
};

