import React from 'react';
import { Home, Compass, Film, MessageSquare, Gamepad2, CirclePlus } from 'lucide-react';

export type NavTab = 'feed' | 'explore' | 'post' | 'reels' | 'chat' | 'games' | 'music' | 'profile' | 'videos';

interface FloatingNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userAvatar: string;
  unreadChatCount?: number;
  // Hide the bar on phone-width screens while an active chat conversation
  // fills the screen; it stays available on the chat list and on md+ split view.
  hideOnMobile?: boolean;
  // Called as soon as a finger / pointer goes down on a tab (before the tap completes), so its page can start downloading early.
  onPressTab?: (tab: NavTab) => void;
}

interface NavButtonProps {
  id: string;
  label?: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

// One column of the bar: a line icon with a small label under it (the label is left out for the Create button, which is only a circled plus).
// The open page is the one in full colour with a heavier icon and bold label; the colours and weights live in index.css (#floating-bottom-nav .nav-item).
const NavButton: React.FC<NavButtonProps> = ({ id, label, title, active = false, onClick, children }) => (
  <button
    id={id}
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-current={active ? 'page' : undefined}
    className={`nav-item ${active ? 'is-active' : ''} w-full h-full flex flex-col items-center justify-center gap-[3px] cursor-pointer`}
  >
    {children}
    {label && <span className="nav-lbl text-[10px] tracking-tight leading-3">{label}</span>}
  </button>
);

// The bar is flat and full width, like YouTube's: three pages, Create in the middle, three more pages (the pages that do not fit — the Videos
// feed and Music — are in the menu on Home; the side menu on a computer still lists every page).
export const FloatingNavBar: React.FC<FloatingNavBarProps> = ({
  activeTab,
  onSelectTab,
  userAvatar,
  unreadChatCount = 0,
  hideOnMobile = false,
  onPressTab
}) => {
  return (
    <nav
      id="floating-bottom-nav"
      data-tab={activeTab}
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[480px] md:max-w-2xl pointer-events-auto xl:hidden ${
        hideOnMobile ? 'max-md:hidden' : ''
      }`}
    >
      <div
        className="nav-row grid grid-cols-7 items-stretch"
        onPointerDown={(e) => {
          const id = (e.target as HTMLElement).closest('button')?.id || '';
          if (id.startsWith('nav-item-')) onPressTab?.(id.slice('nav-item-'.length) as NavTab);
        }}
      >
        <NavButton id="nav-item-feed" label="Home" title="Home" active={activeTab === 'feed'} onClick={() => onSelectTab('feed')}>
          <Home className="nav-ico w-6 h-6" />
        </NavButton>

        <NavButton id="nav-item-explore" label="Explore" title="Explore" active={activeTab === 'explore'} onClick={() => onSelectTab('explore')}>
          <Compass className="nav-ico w-6 h-6" />
        </NavButton>

        <NavButton id="nav-item-reels" label="Reels" title="Reels" active={activeTab === 'reels'} onClick={() => onSelectTab('reels')}>
          <Film className="nav-ico w-6 h-6" />
        </NavButton>

        {/* Create: opens the post / reel / story picker, never a page of its own, so it is never the "open" one */}
        <NavButton id="nav-item-post" title="Create a post, reel or story" onClick={() => onSelectTab('post')}>
          <CirclePlus className="nav-ico nav-create w-8 h-8" />
        </NavButton>

        <NavButton id="nav-item-chat" label="Chat" title="Direct Messages" active={activeTab === 'chat'} onClick={() => onSelectTab('chat')}>
          <div className="relative">
            <MessageSquare className="nav-ico w-6 h-6" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-[15px] h-[15px] bg-red-500 text-white font-black text-[8px] rounded-full flex items-center justify-center shadow-sm animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </div>
        </NavButton>

        <NavButton id="nav-item-games" label="Games" title="Mini-Games Arena" active={activeTab === 'games'} onClick={() => onSelectTab('games')}>
          <Gamepad2 className="nav-ico w-6 h-6" />
        </NavButton>

        <NavButton id="nav-item-profile" label="You" title="My Profile" active={activeTab === 'profile'} onClick={() => onSelectTab('profile')}>
          <span className="nav-ava block w-6 h-6 rounded-full overflow-hidden">
            <img
              src={userAvatar || '/noob-logo.svg.jpeg'}
              alt="You"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </span>
        </NavButton>
      </div>
    </nav>
  );
};
