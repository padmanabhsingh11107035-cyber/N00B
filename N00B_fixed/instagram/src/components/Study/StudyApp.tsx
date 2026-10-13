import React from 'react';
import { BookOpen, CalendarDays, Home, LayoutGrid, Sparkles } from 'lucide-react';
import type { User } from '../../types';
import { StudyProvider, useStudy } from './StudyContext';
import { currentEntry, goStudy, isTopLevel, useStudyNav, type StudyParams } from './studyStore';
import { ErrorBox, Loading, Orb } from './ui';

// NOOB STUDY: the shell. It decides which screen to show (each screen is fetched only when first opened) and draws the bottom bar.
// A screen that is not built yet simply has no entry in ROUTES, and nothing in the app links to it.

export interface PageProps { params: StudyParams }
type PageLoader = () => Promise<{ default: React.ComponentType<PageProps> }>;

const ROUTES: Record<string, React.LazyExoticComponent<React.ComponentType<PageProps>>> = {};
const reg = (page: string, load: PageLoader) => { ROUTES[page] = React.lazy(load); };
reg('welcome', () => import('./pages/Welcome'));
reg('onboarding', () => import('./pages/Onboarding'));
reg('home', () => import('./pages/Home'));
reg('tasks', () => import('./pages/Tasks'));
reg('exams', () => import('./pages/Exams'));
reg('focus', () => import('./pages/Focus'));
reg('tutor', () => import('./pages/Tutor'));
reg('chat', () => import('./pages/Chat'));
reg('photo', () => import('./pages/PhotoDoubt'));
reg('voice', () => import('./pages/Voice'));
reg('subjects', () => import('./pages/Subjects'));
reg('subject', () => import('./pages/SubjectPage'));
reg('more', () => import('./pages/More'));
reg('profile', () => import('./pages/Profile'));
reg('settings', () => import('./pages/Settings'));
reg('privacy', () => import('./pages/Privacy'));

export const hasRoute = (page: string): boolean => page in ROUTES;
export const preloadStudy = (): void => { void import('./pages/Home'); };

const NAV: Array<{ page: string; label: string; icon: React.ReactNode }> = [
  { page: 'home', label: 'Home', icon: <Home size={20} /> },
  { page: 'tutor', label: 'Tutor', icon: <Sparkles size={20} /> },
  { page: 'plan', label: 'Plan', icon: <CalendarDays size={20} /> },
  { page: 'subjects', label: 'Subjects', icon: <BookOpen size={20} /> },
  { page: 'more', label: 'More', icon: <LayoutGrid size={20} /> }
];

const Shell: React.FC = () => {
  const nav = useStudyNav();
  const { loading, error, me, reload, skipped } = useStudy();
  let { page, params } = currentEntry(nav);

  if (loading && !me) {
    return (
      <div className="st-scroll" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Orb size={64} float />
          <p className="st-title st-h3" style={{ marginTop: 14 }}>Getting your study space ready…</p>
        </div>
      </div>
    );
  }
  if (error && !me) {
    return <div className="st-scroll"><div className="st-wrap"><ErrorBox text={error} onRetry={() => void reload()} /></div></div>;
  }

  // someone who has not set up yet sees the welcome first (unless they chose to look around)
  if (page === 'home' && !me?.profile?.onboardingDone && !skipped) page = 'welcome';

  const Page = ROUTES[page] || ROUTES.home;
  const showNav = isTopLevel(page);
  return (
    <>
      <React.Suspense fallback={<div className="st-scroll"><div className="st-wrap"><Loading /></div></div>}>
        <Page params={params} />
      </React.Suspense>
      {showNav && (
        <nav className="st-nav" aria-label="NOOB STUDY">
          {NAV.filter((n) => hasRoute(n.page)).map((n) => (
            <button key={n.page} className="st-nav-item" data-on={page === n.page ? 'true' : 'false'} onClick={() => goStudy(n.page)} aria-current={page === n.page ? 'page' : undefined}>
              {n.icon}{n.label}
            </button>
          ))}
        </nav>
      )}
    </>
  );
};

export const StudyApp: React.FC<{ user: User }> = ({ user }) => (
  <div className="st-root" role="dialog" aria-label="NOOB STUDY">
    <StudyProvider user={user}><Shell /></StudyProvider>
  </div>
);
export default StudyApp;
