import React, { useRef } from 'react';
import { Home, Compass, Gamepad2 } from 'lucide-react';
import { FeedIcon } from '../Common/FeedIcon';
import { useFeatureOn } from '../../utils/featureFlags';
import { useKeyboardOpen } from '../../utils/useVisualViewport';
import { DOUBLE_TAP_MS, quickSwitchLinked } from '../../utils/quickSwitch';

export type NavTab = 'feed' | 'explore' | 'post' | 'reels' | 'chat' | 'games' | 'music' | 'profile' | 'videos';

interface FloatingNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  userAvatar: string;
  unreadChatCount?: number;
  // The red numbers on the other pages: how many new things are waiting there (new posts on Home, new reels on Reels, challenges on Games ...). Chat has unreadChatCount.
  badges?: Partial<Record<NavTab, number>>;
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

// The red dot with the number of updates on a page's icon (99+ when there are many).
const NavBadge: React.FC<{ count: number; dot?: boolean }> = ({ count, dot }) => (count > 0 && dot ? (
  <span className="nav-badge nav-dot absolute -top-0.5 -right-0.5 w-[11px] h-[11px] bg-red-500 rounded-full" data-testid="nav-badge" aria-label={`${count} new`} />
) : count > 0 ? (
  <span className="nav-badge absolute -top-1.5 -right-2.5 px-1 min-w-[15px] h-[15px] bg-red-500 text-white font-black text-[8px] rounded-full flex items-center justify-center shadow-sm" data-testid="nav-badge" aria-label={`${count} new`}>
    {count > 99 ? '99+' : count}
  </span>
) : null);

// The three icons drawn like Instagram's: Reels (a rounded square with the clapper stripe and a play triangle), Chat (a round speech bubble with three dots), and Create (a bright gradient circle with a white plus).
const ReelsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <path d="M3.5 8.5h17M9.2 3.2l3 5.3M14.8 3.2l3 5.3" />
    <path d="M10.2 12.3v4.4a.7.7 0 0 0 1.05.6l3.6-2.2a.7.7 0 0 0 0-1.2l-3.6-2.2a.7.7 0 0 0-1.05.6Z" fill="currentColor" stroke="none" />
  </svg>
);
const ChatIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
    <circle cx="8.4" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);
const CreateIcon: React.FC = () => (
  <span className="nav-create-orb" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5.5v13M5.5 12h13" /></svg>
  </span>
);

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
// feed (in the menu on Home) and Music (its own button at the top of Home); the long strip on a tablet or computer lists every page).
export const FloatingNavBar: React.FC<FloatingNavBarProps> = ({
  activeTab,
  onSelectTab,
  userAvatar,
  unreadChatCount = 0,
  badges = {},
  hideOnMobile = false,
  onPressTab
}) => {
  // a page that the administrator has switched off for users has no button (the others share the width)
  const showExplore = useFeatureOn('explore'), showReels = useFeatureOn('reels'), showCreate = useFeatureOn('create'), showChat = useFeatureOn('chat'), showGames = useFeatureOn('games'), showVideos = useFeatureOn('videos');
  const columns = 2 + [showExplore, showReels, showVideos, showCreate, showChat, showGames].filter(Boolean).length;
  // While the keyboard is open the bar steps aside: the keyboard of a phone is see-through glass, and the bar showed through it (with the posts behind) in the gap above it
  const keyboardOpen = useKeyboardOpen();
  // Tap "You" once: your profile. Tap it twice quickly: jump to your other account with the same e-mail (see utils/quickSwitch.ts).
  const count = (tab: NavTab): number => (tab === 'chat' ? (unreadChatCount > 0 ? unreadChatCount : 0) : badges[tab] || 0);
  const lastProfileTap = useRef(0);
  const tapProfile = () => {
    const now = Date.now();
    const twice = now - lastProfileTap.current < DOUBLE_TAP_MS;
    lastProfileTap.current = twice ? 0 : now;
    if (twice) void quickSwitchLinked();
    else onSelectTab('profile');
  };
  return (
    <nav
      id="floating-bottom-nav"
      data-tab={activeTab}
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[480px] md:max-w-2xl pointer-events-auto md:hidden ${
        hideOnMobile ? 'max-md:hidden' : ''
      } ${keyboardOpen ? 'hidden' : ''}`}
    >
      <div
        className="nav-row grid grid-cols-7 items-stretch"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        onPointerDown={(e) => {
          const id = (e.target as HTMLElement).closest('button')?.id || '';
          if (id.startsWith('nav-item-')) onPressTab?.(id.slice('nav-item-'.length) as NavTab);
        }}
      >
        <NavButton id="nav-item-feed" label="Home" title="Home" active={activeTab === 'feed'} onClick={() => onSelectTab('feed')}>
          <div className="relative">
            <Home className="nav-ico w-7 h-7" />
            <NavBadge count={count('feed')} />
          </div>
        </NavButton>

        {showExplore && (
          <NavButton id="nav-item-explore" label="Explore" title="Explore" active={activeTab === 'explore'} onClick={() => onSelectTab('explore')}>
            <div className="relative">
              <Compass className="nav-ico w-7 h-7" />
              <NavBadge count={count('explore')} />
            </div>
          </NavButton>
        )}

        {showReels && (
          <NavButton id="nav-item-reels" label="Reels" title="Reels" active={activeTab === 'reels'} onClick={() => onSelectTab('reels')}>
            <div className="relative">
              <ReelsIcon className="nav-ico w-7 h-7" />
              <NavBadge count={count('reels')} />
            </div>
          </NavButton>
        )}

        {/* Feed: long videos and live streams (the same page and icon as the Feed button at the top of Home) */}
        {showVideos && (
          <NavButton id="nav-item-videos" label="Feed" title="Feed: long videos and live streams" active={activeTab === 'videos'} onClick={() => onSelectTab('videos')}>
            <div className="relative">
              <FeedIcon className="nav-ico w-7 h-7" />
              <NavBadge count={count('videos')} />
            </div>
          </NavButton>
        )}

        {/* Create: opens the post / reel / story picker, never a page of its own, so it is never the "open" one */}
        {showCreate && (
          <NavButton id="nav-item-post" title="Create a post, reel or story" onClick={() => onSelectTab('post')}>
            <CreateIcon />
          </NavButton>
        )}

        {showChat && (
          <NavButton id="nav-item-chat" label="Chat" title="Direct Messages" active={activeTab === 'chat'} onClick={() => onSelectTab('chat')}>
            <div className="relative">
              <ChatIcon className="nav-ico w-7 h-7" />
              <NavBadge count={count('chat')} dot />
            </div>
          </NavButton>
        )}

        {showGames && (
          <NavButton id="nav-item-games" label="Games" title="Mini-Games Arena" active={activeTab === 'games'} onClick={() => onSelectTab('games')}>
            <div className="relative">
              <Gamepad2 className="nav-ico w-7 h-7" />
              <NavBadge count={count('games')} />
            </div>
          </NavButton>
        )}

        <NavButton id="nav-item-profile" label="You" title="My Profile" active={activeTab === 'profile'} onClick={tapProfile}>
          <span className="relative block">
            <span className="nav-ava block w-7 h-7 rounded-full overflow-hidden">
              <img
                src={userAvatar || '/noob-logo.svg.jpeg'}
                alt="You"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </span>
            <NavBadge count={count('profile')} />
          </span>
        </NavButton>
      </div>
    </nav>
  );
};
