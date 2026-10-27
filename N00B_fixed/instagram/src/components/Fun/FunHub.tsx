import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Home, Zap, MessageCircleQuestion, Smile, BarChart3 } from 'lucide-react';
import type { User } from '../../types';
import { FUN_FEATURES, type FunFeature, type FunLocation } from '../../utils/funRoutes';
import { SkeletonCards } from './funUi';
import type { FunPageProps } from './types';

// The four pages of the three-line menu's "Fun" group - This or That, Ask Me Anything, Mood Status, Public Polls - inside one frame: a way back Home that is always at the top,
// and a strip of the four pages with the one you are on lit, so moving between them never needs the menu again. It opens over whatever page you were on (that page stays alive
// underneath), so closing it puts you back exactly where you were.

const ThisOrThatPage = React.lazy(() => import('./ThisOrThatPage'));
const AskPage = React.lazy(() => import('./AskPage'));
const MoodPage = React.lazy(() => import('./MoodPage'));
const FormsHub = React.lazy(() => import('../Forms/FormsHub'));
const PollsPage = React.lazy(() => import('./PollsPage'));

const ICONS: Record<FunFeature, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  'this-or-that': Zap,
  ask: MessageCircleQuestion,
  mood: Smile,
  polls: BarChart3
};

/** Starts loading a page's code before it is opened (a tap on the menu entry, a hover on a tab). */
export const preloadFunPage = (feature: FunFeature): void => {
  const load = { 'this-or-that': () => import('./ThisOrThatPage'), ask: () => import('./AskPage'), mood: () => import('./MoodPage'), polls: () => import('./PollsPage') }[feature];
  void load().catch(() => undefined);
};

interface Props {
  currentUser: User | null;
  location: FunLocation;
  onNavigate: (loc: FunLocation) => void;
  /** one step back: to the page this one was opened from */
  onBack: () => void;
  /** straight to the Home page */
  onHome: () => void;
  onLogin?: () => void;
  onOpenProfile?: (user: User) => void;
}

export const FunHub: React.FC<Props> = ({ currentUser, location, onNavigate, onBack, onHome, onLogin, onOpenProfile }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const active = FUN_FEATURES.find((f) => f.id === location.feature) ?? FUN_FEATURES[0];
  const isForms = location.feature === 'forms' || location.feature === 'form';

  // a new page starts at its top
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [location.feature, location.target]);

  const pageProps: FunPageProps = { currentUser, target: location.target, onLogin, onOpenProfile, onOpenFeature: onNavigate };
  // NOOB Forms: its own full screens (my forms, the editor, the answers) and the public form anybody can fill
  if (isForms) {
    return (
      <React.Suspense fallback={<div className="fixed inset-0 z-[96] bg-black" />}>
        <FormsHub currentUser={currentUser} location={location} onNavigate={onNavigate} onBack={onBack} onHome={onHome} onLogin={onLogin} />
      </React.Suspense>
    );
  }
  // Mood is one full screen of its own (no header, no tabs): it has its own way back
  if (active.id === 'mood') {
    return (
      <React.Suspense fallback={<div className="fixed inset-0 z-[96] bg-page" />}>
        <MoodPage {...pageProps} onBack={onBack} />
      </React.Suspense>
    );
  }
  const Page = { 'this-or-that': ThisOrThatPage, ask: AskPage, mood: MoodPage, polls: PollsPage }[active.id];

  return (
    <div ref={scrollRef} className="fixed inset-0 z-[96] overflow-y-auto overscroll-contain bg-page doodle-wallpaper-feed text-white" role="region" aria-label={active.label}>
      <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 flex items-center gap-2.5">
          <button type="button" onClick={onBack} aria-label="Go back" className="shrink-0 h-9 pl-2.5 pr-3.5 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 transition-transform">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base leading-tight truncate">{active.label}</h1>
            <p className="text-[11px] text-zinc-400 truncate">{active.blurb}</p>
          </div>
          <button type="button" onClick={onHome} aria-label="Back to the Home page" title="Home" className="shrink-0 w-9 h-9 rounded-full border border-zinc-700 hover:border-zinc-50 flex items-center justify-center cursor-pointer active:scale-95 transition-transform">
            <Home className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <nav className="max-w-2xl mx-auto px-3 pb-2.5 flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="NOOB Fun pages">
          {FUN_FEATURES.map((f) => {
            const Icon = ICONS[f.id];
            const on = f.id === active.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-current={on ? 'page' : undefined}
                onClick={() => { if (!on) onNavigate({ feature: f.id }); }}
                onPointerEnter={() => preloadFunPage(f.id)}
                className={`flex-1 min-w-[88px] h-9 px-3 rounded-full border text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all duration-200 ${on ? 'bg-noob text-black border-zinc-50 shadow-lg scale-[1.02]' : 'border-zinc-700 text-zinc-300 hover:border-zinc-50 hover:text-white'}`}
              >
                <Icon className={`w-3.5 h-3.5 ${on ? '' : 'opacity-80'}`} aria-hidden={true} />
                <span>{f.short}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <React.Suspense fallback={<SkeletonCards count={3} label={`Loading ${active.label}`} />}>
          <div key={`${active.id}:${location.target ?? ''}`} className="animate-in fade-in duration-200">
            <Page {...pageProps} />
          </div>
        </React.Suspense>
      </div>
    </div>
  );
};

export default FunHub;
