import React from 'react';
import { Home, Compass, Youtube, Film, MessageSquare, Gamepad2, Music } from 'lucide-react';

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
  // The administrator hid the Music page: its icon leaves and the other seven share the bar (wider columns, slightly bigger icons).
  hideMusic?: boolean;
}

interface NavButtonProps {
  id: string;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

// The order of the buttons below (left to right), used to slide the marker under the open one.
const TAB_ORDER: NavTab[] = ['feed', 'explore', 'reels', 'music', 'videos', 'games', 'chat', 'profile'];   // without 'music' when the page is hidden

// Every nav item shares the same liquid-glass pill: idle items get a faint
// glass surface that brightens on hover/press. The lit marker behind the open item is ONE shape that slides from icon to icon
// (see .nav-marker in index.css), so changing page moves it instead of switching it off here and on there.
const NavButton: React.FC<NavButtonProps> = ({ id, label, title, active, onClick, children }) => (
  <button
    id={id}
    onClick={onClick}
    title={title}
    className="w-full h-full flex items-center justify-center cursor-pointer"
  >
    <div
      className="liquid-glass-btn flex flex-col items-center justify-center gap-0.5 px-2.5 sm:px-3 py-1.5 min-w-[46px]"
    >
      {children}
      <span
        className={`nav-lbl text-[9px] tracking-tight leading-none ${
          active ? 'text-noob font-bold' : 'text-gray-300'
        }`}
      >
        {label}
      </span>
    </div>
  </button>
);

export const FloatingNavBar: React.FC<FloatingNavBarProps> = ({
  activeTab,
  onSelectTab,
  userAvatar,
  unreadChatCount = 0,
  hideOnMobile = false,
  onPressTab,
  hideMusic = false
}) => {
  const order = hideMusic ? TAB_ORDER.filter((t) => t !== 'music') : TAB_ORDER;
  const count = order.length;
  return (
    <nav
      id="floating-bottom-nav"
      data-count={count}
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[96%] max-w-[480px] pointer-events-auto xl:hidden ${
        hideOnMobile ? 'max-md:hidden' : ''
      }`}
    >
      <div
        className="liquid-glass relative rounded-full h-16 grid items-center justify-items-center px-1"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        onPointerDown={(e) => {
          const id = (e.target as HTMLElement).closest('button')?.id || '';
          if (id.startsWith('nav-item-')) onPressTab?.(id.slice('nav-item-'.length) as NavTab);
        }}
      >
        <span
          aria-hidden="true"
          className="nav-marker"
          style={{ ['--nav-i' as any]: Math.max(0, order.indexOf(activeTab)), opacity: order.includes(activeTab) ? 1 : 0 }}
        />
        {/* 1. Feed (posts/stories) — labeled "Home", the app's main landing tab */}
        <NavButton
          id="nav-item-feed"
          label="Home"
          title="Home"
          active={activeTab === 'feed'}
          onClick={() => onSelectTab('feed')}
        >
          <Home
            className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'feed' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 2. Explore */}
        <NavButton
          id="nav-item-explore"
          label="Explore"
          title="Explore"
          active={activeTab === 'explore'}
          onClick={() => onSelectTab('explore')}
        >
          <Compass
            className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'explore' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 3. Reels */}
        <NavButton
          id="nav-item-reels"
          label="Reels"
          title="Reels"
          active={activeTab === 'reels'}
          onClick={() => onSelectTab('reels')}
        >
          <Film
            className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'reels' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 4. Music Hub (left out while the administrator has the Music page hidden) */}
        {!hideMusic && (
          <NavButton
            id="nav-item-music"
            label="Music"
            title="Music Hub"
            active={activeTab === 'music'}
            onClick={() => onSelectTab('music')}
          >
            <Music
              className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
                activeTab === 'music' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
              }`}
            />
          </NavButton>
        )}

        {/* 5. Feed — the YouTube-style long video feed (live streams + uploaded videos only, no
            reels). Create moved up to the top header; this slot used to be the Create button. */}
        <NavButton
          id="nav-item-videos"
          label="Feed"
          title="Feed — Videos & Live"
          active={activeTab === 'videos'}
          onClick={() => onSelectTab('videos')}
        >
          <Youtube
            className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'videos' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 6. Games Hub */}
        <NavButton
          id="nav-item-games"
          label="Games"
          title="Mini-Games Arena"
          active={activeTab === 'games'}
          onClick={() => onSelectTab('games')}
        >
          <Gamepad2
            className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'games' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 7. Chat */}
        <NavButton
          id="nav-item-chat"
          label="Chat"
          title="Direct Messages"
          active={activeTab === 'chat'}
          onClick={() => onSelectTab('chat')}
        >
          <div className="relative">
            <MessageSquare
              className={`nav-ico w-4 h-4 sm:w-5 sm:h-5 ${
                activeTab === 'chat' ? 'stroke-noob stroke-[2.5]' : 'stroke-gray-300'
              }`}
            />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-[15px] h-[15px] bg-red-500 text-white font-black text-[8px] rounded-full flex items-center justify-center shadow-sm animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </div>
        </NavButton>

        {/* 8. Profile */}
        <NavButton
          id="nav-item-profile"
          label="Profile"
          title="My Profile"
          active={activeTab === 'profile'}
          onClick={() => onSelectTab('profile')}
        >
          <div
            className={`nav-ava w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden p-[1px] ${
              activeTab === 'profile' ? 'ring-2 ring-noob' : 'bg-gradient-to-tr from-noob to-[#00E5FF]'
            }`}
          >
            <img
              src={userAvatar || '/noob-logo.svg.jpeg'}
              alt="User"
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </NavButton>
      </div>
    </nav>
  );
};
