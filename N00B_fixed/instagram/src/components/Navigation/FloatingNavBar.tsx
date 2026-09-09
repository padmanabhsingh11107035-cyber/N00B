import React from 'react';
import { Home, Compass, Plus, Film, MessageSquare, Gamepad2, Music } from 'lucide-react';

export type NavTab = 'feed' | 'explore' | 'post' | 'reels' | 'chat' | 'games' | 'music' | 'profile';

interface FloatingNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userAvatar: string;
  unreadChatCount?: number;
  // Hide the bar on phone-width screens while an active chat conversation
  // fills the screen; it stays available on the chat list and on md+ split view.
  hideOnMobile?: boolean;
}

interface NavButtonProps {
  id: string;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

// Every nav item shares the same liquid-glass pill: idle items get a faint
// glass surface that brightens on hover/press, the active item stays lit.
const NavButton: React.FC<NavButtonProps> = ({ id, label, title, active, onClick, children }) => (
  <button
    id={id}
    onClick={onClick}
    title={title}
    className="w-full h-full flex items-center justify-center cursor-pointer"
  >
    <div
      className={`liquid-glass-btn flex flex-col items-center justify-center gap-0.5 px-2.5 sm:px-3 py-1.5 min-w-[46px] ${
        active ? 'liquid-glass-btn-active' : ''
      }`}
    >
      {children}
      <span
        className={`text-[9px] tracking-tight leading-none ${
          active ? 'text-[#00FF66] font-bold' : 'text-gray-300'
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
  hideOnMobile = false
}) => {
  return (
    <nav
      id="floating-bottom-nav"
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[96%] max-w-[480px] pointer-events-auto xl:hidden ${
        hideOnMobile ? 'max-md:hidden' : ''
      }`}
    >
      <div className="liquid-glass rounded-full h-16 grid grid-cols-8 items-center justify-items-center px-1">
        {/* 1. Feed */}
        <NavButton
          id="nav-item-feed"
          label="Feed"
          title="Feed"
          active={activeTab === 'feed'}
          onClick={() => onSelectTab('feed')}
        >
          <Home
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'feed' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
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
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'explore' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
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
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'reels' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 4. Music Hub */}
        <NavButton
          id="nav-item-music"
          label="Music"
          title="Music Hub"
          active={activeTab === 'music'}
          onClick={() => onSelectTab('music')}
        >
          <Music
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'music' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 5. Upload / Create */}
        <NavButton
          id="nav-item-post-center"
          label="Create"
          title="Create New Post / Upload Reel"
          active={activeTab === 'post'}
          onClick={() => onSelectTab('post')}
        >
          <Plus
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'post' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
            }`}
          />
        </NavButton>

        {/* 6. Games Hub */}
        <NavButton
          id="nav-item-games"
          label="Games"
          title="50 Mini-Games Arena"
          active={activeTab === 'games'}
          onClick={() => onSelectTab('games')}
        >
          <Gamepad2
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              activeTab === 'games' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
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
              className={`w-4 h-4 sm:w-5 sm:h-5 ${
                activeTab === 'chat' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-gray-300'
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
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden p-[1px] ${
              activeTab === 'profile' ? 'ring-2 ring-[#00FF66]' : 'bg-gradient-to-tr from-[#00FF66] to-[#00E5FF]'
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
