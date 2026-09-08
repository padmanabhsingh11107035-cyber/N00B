import React from 'react';
import { Home, Compass, Plus, Film, MessageSquare, Gamepad2, Music } from 'lucide-react';

export type NavTab = 'feed' | 'explore' | 'post' | 'reels' | 'chat' | 'games' | 'music' | 'profile';

interface FloatingNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userAvatar: string;
  unreadChatCount?: number;
}

export const FloatingNavBar: React.FC<FloatingNavBarProps> = ({
  activeTab,
  onSelectTab,
  userAvatar,
  unreadChatCount = 0
}) => {
  return (
    <nav
      id="floating-bottom-nav"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[96%] max-w-[480px] pointer-events-auto xl:hidden"
    >
      <div className="bg-[#0f1914]/95 backdrop-blur-xl border border-[#00FF66]/30 rounded-full h-16 grid grid-cols-8 items-center justify-items-center px-1 shadow-[0_0_25px_rgba(0,255,102,0.2)]">
        {/* 1. Feed Item (Left 1) */}
        <button
          id="nav-item-feed"
          onClick={() => onSelectTab('feed')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'feed'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Feed"
        >
          <Home className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'feed' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'feed' ? 'text-[#00FF66] font-bold' : ''}`}>Feed</span>
        </button>

        {/* 2. Explore Item (Left 2) */}
        <button
          id="nav-item-explore"
          onClick={() => onSelectTab('explore')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'explore'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Explore"
        >
          <Compass className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'explore' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'explore' ? 'text-[#00FF66] font-bold' : ''}`}>Explore</span>
        </button>

        {/* 3. Reels Item (Left 3) */}
        <button
          id="nav-item-reels"
          onClick={() => onSelectTab('reels')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'reels'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Reels"
        >
          <Film className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'reels' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'reels' ? 'text-[#00FF66] font-bold' : ''}`}>Reels</span>
        </button>

        {/* 4. Music Hub */}
        <button
          id="nav-item-music"
          onClick={() => onSelectTab('music')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'music'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Music Hub"
        >
          <Music className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'music' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'music' ? 'text-[#00FF66] font-bold' : ''}`}>Music</span>
        </button>

        {/* 4. EXACT CENTER: Upload [+] Button (Column 4 of 7) */}
        <button
          id="nav-item-post-center"
          onClick={() => onSelectTab('post')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'post'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Create New Post / Upload Reel"
        >
          <Plus className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'post' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'post' ? 'text-[#00FF66] font-bold' : ''}`}>Create</span>
        </button>

        {/* 5. Games Hub (Right 1) */}
        <button
          id="nav-item-games"
          onClick={() => onSelectTab('games')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'games'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="50 Mini-Games Arena"
        >
          <Gamepad2 className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'games' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'games' ? 'text-[#00FF66] font-bold' : ''}`}>Games</span>
        </button>

        {/* 6. Chat Item (Right 2) */}
        <button
          id="nav-item-chat"
          onClick={() => onSelectTab('chat')}
          className={`w-full relative flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'chat'
              ? 'text-[#00FF66] opacity-100'
              : 'text-gray-400 opacity-60 hover:opacity-100 hover:text-white'
          }`}
          title="Direct Messages"
        >
          <div className="relative">
            <MessageSquare className={`w-4 h-4 sm:w-5 sm:h-5 ${activeTab === 'chat' ? 'stroke-[#00FF66] stroke-[2.5]' : 'stroke-current'}`} />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-[15px] h-[15px] bg-red-500 text-white font-black text-[8px] rounded-full flex items-center justify-center shadow-sm animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </div>
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'chat' ? 'text-[#00FF66] font-bold' : ''}`}>Chat</span>
        </button>

        {/* 7. Profile Item (Right 3) */}
        <button
          id="nav-item-profile"
          onClick={() => onSelectTab('profile')}
          className={`w-full flex flex-col items-center justify-center py-1 transition-all duration-200 cursor-pointer ${
            activeTab === 'profile'
              ? 'text-[#00FF66] opacity-100'
              : 'opacity-70 hover:opacity-100'
          }`}
          title="My Profile"
        >
          <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden p-[1px] ${
            activeTab === 'profile' ? 'ring-2 ring-[#00FF66]' : 'bg-gradient-to-tr from-[#00FF66] to-[#00E5FF]'
          }`}>
            <img
              src={userAvatar || '/noob-logo.svg.jpeg'}
              alt="User"
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className={`text-[9px] tracking-tight mt-0.5 ${activeTab === 'profile' ? 'text-[#00FF66] font-bold' : 'text-gray-300'}`}>Profile</span>
        </button>
      </div>
    </nav>
  );
};
