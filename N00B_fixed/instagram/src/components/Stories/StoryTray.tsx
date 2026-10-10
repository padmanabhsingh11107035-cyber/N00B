import React, { useState } from 'react';
import { Plus, Check, Clock, Volume2 } from 'lucide-react';
import { User, StatusNote } from '../../types';
import { StatusNoteViewerModal } from '../Modals/StatusNoteViewerModal';
import { fetchUserById } from '../../services/api';
import type { StoryTrayModel, TrayItem, TrayRing } from '../../utils/storyTray';

interface StoryTrayProps {
  currentUser: User;
  /** Who is in the tray and in which order (utils/storyTray.ts). */
  model: StoryTrayModel;
  /** Opens the full-screen viewer at this position of `model.viewerStories`. */
  onOpenStoryViewer: (startIndex: number) => void;
  onOpenCreateStory: () => void;
  onOpenStatusNoteModal: () => void;
  onClearStatusNote?: () => void;
  /** Tapping a suggested account's picture opens their profile. */
  onNavigateToProfile?: (user: User) => void;
  /** The plus badge on a suggested account follows them. */
  onToggleFollowUser?: (userId: string) => Promise<{ success: boolean; isFollowing: boolean; isFollowRequested?: boolean } | void>;
  allUsers?: User[];
}

// The ring around a picture: rainbow = a story you have not seen, grey = seen, nothing = no story.
const RING_BG: Record<TrayRing, string> = {
  unseen: 'bg-gradient-to-tr from-rose-500 via-amber-400 via-emerald-400 via-sky-500 to-purple-600 shadow-[0_0_10px_rgba(236,72,153,0.3)]',
  seen: 'bg-zinc-600',
  none: 'bg-transparent'
};
const RING_BG_CLOSE_FRIENDS = 'bg-gradient-to-tr from-noob via-noob-strong to-noob shadow-[0_0_10px_rgba(217,119,87,0.3)]';

const RingedAvatar: React.FC<{ ring: TrayRing; closeFriends?: boolean; src?: string; alt: string }> = ({ ring, closeFriends, src, alt }) => (
  <div className={`w-16 h-16 rounded-full p-[2px] transition-transform duration-200 group-hover:scale-105 ${ring === 'unseen' && closeFriends ? RING_BG_CLOSE_FRIENDS : RING_BG[ring]}`}>
    <div className="w-full h-full rounded-full bg-black p-[2px]">
      <img src={src || '/noob-logo.svg.jpeg'} alt={alt} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
    </div>
  </div>
);

export const StoryTray: React.FC<StoryTrayProps> = ({
  currentUser,
  model,
  onOpenStoryViewer,
  onOpenCreateStory,
  onOpenStatusNoteModal,
  onClearStatusNote,
  onNavigateToProfile,
  onToggleFollowUser,
  allUsers = []
}) => {
  const [selectedNoteViewer, setSelectedNoteViewer] = useState<{
    note: StatusNote;
    user: { id?: string; username: string; displayName?: string; avatar?: string };
    isCurrentUser: boolean;
  } | null>(null);
  // What happened to the accounts followed from the plus badge in this tray (the app's own follow list also updates, this just makes the badge change at once)
  const [followed, setFollowed] = useState<Record<string, 'following' | 'requested'>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Check 24-hour expiration for status note
  const isMyNoteValid =
    currentUser.statusNote &&
    (!currentUser.statusNote.expiresAt || Date.now() < currentUser.statusNote.expiresAt);

  const myFollowing = new Set(currentUser.followingIds || []);
  const followState = (id: string): 'following' | 'requested' | 'none' =>
    followed[id] === 'following' || myFollowing.has(id) ? 'following' : followed[id] === 'requested' ? 'requested' : 'none';

  const followSuggestion = async (item: TrayItem) => {
    if (!onToggleFollowUser || busy.has(item.userId) || followState(item.userId) !== 'none') return;
    setBusy((prev) => new Set(prev).add(item.userId));
    try {
      const res = await onToggleFollowUser(item.userId);
      if (res && res.success !== false) {
        if (res.isFollowing) setFollowed((prev) => ({ ...prev, [item.userId]: 'following' }));
        else if (res.isFollowRequested) setFollowed((prev) => ({ ...prev, [item.userId]: 'requested' }));
      }
    } finally {
      setBusy((prev) => { const next = new Set(prev); next.delete(item.userId); return next; });
    }
  };

  const openSuggestionProfile = async (item: TrayItem) => {
    if (!onNavigateToProfile) return;
    const known = allUsers.find((u) => u.id === item.userId);
    const user = known || (await fetchUserById(item.userId));
    if (user) onNavigateToProfile(user);
  };

  const own = model.own;

  return (
    <div id="stories-tray-container" className="w-full border-b border-white/5 bg-zinc-950/40 backdrop-blur-md py-3 px-3">
      {/* Horizontal scrolling stories tray */}
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1">
        {/* Current User Story & Status Note Item */}
        <div className="flex flex-col items-center flex-shrink-0 relative group">
          {/* Status Note Bubble */}
          <button
            id="status-note-bubble"
            onClick={() => {
              if (isMyNoteValid && currentUser.statusNote) {
                setSelectedNoteViewer({
                  note: currentUser.statusNote,
                  user: {
                    id: currentUser.id,
                    username: currentUser.username,
                    displayName: currentUser.displayName,
                    avatar: currentUser.avatar
                  },
                  isCurrentUser: true
                });
              } else {
                onOpenStatusNoteModal();
              }
            }}
            className="mb-1 max-w-[86px] bg-zinc-900/95 border border-noob/50 rounded-full px-2 py-0.5 text-[9px] text-noob font-semibold truncate shadow-md hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
            title={isMyNoteValid ? "Click to expand note & play song" : "Add Status Note (24-hour lifespan)"}
          >
            {isMyNoteValid && currentUser.statusNote ? (
              <>
                <span className="truncate">{currentUser.statusNote.text}</span>
                {currentUser.statusNote.musicTrack && (
                  <Volume2 className="w-2.5 h-2.5 flex-shrink-0 animate-pulse text-noob" />
                )}
              </>
            ) : (
              <span className="text-zinc-400 font-medium">+ Note</span>
            )}
          </button>

          {/* My picture: a ring when I have a story (tap to watch it), a plus to add another */}
          <div className="relative group">
            <button
              id={own.hasStory ? 'my-story-btn' : 'create-story-btn'}
              onClick={() => (own.hasStory ? onOpenStoryViewer(own.startIndex) : onOpenCreateStory())}
              className="cursor-pointer block"
              title={own.hasStory ? 'View your story' : 'Add to Story'}
              aria-label={own.hasStory ? 'View your story' : 'Add to your story'}
            >
              {own.hasStory ? (
                <RingedAvatar ring={own.ring} src={currentUser.avatar} alt="My Story" />
              ) : (
                <div className="w-16 h-16 rounded-full p-[2px] bg-zinc-800 hover:bg-zinc-700 transition-colors">
                  <div className="w-full h-full rounded-full p-[2px] bg-black">
                    <img src={currentUser.avatar || '/noob-logo.svg.jpeg'} alt="My Story" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>
              )}
            </button>
            {own.hasStory ? (
              <button
                id="create-story-btn"
                onClick={onOpenCreateStory}
                title="Add to Story"
                aria-label="Add to your story"
                className="absolute bottom-0 right-0 w-5 h-5 bg-noob text-black rounded-full flex items-center justify-center border-2 border-black shadow-sm cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[3]" />
              </button>
            ) : (
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-noob text-black rounded-full flex items-center justify-center border-2 border-black shadow-sm pointer-events-none">
                <Plus className="w-3 h-3 stroke-[3]" />
              </div>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 font-medium tracking-tight">Your story</span>
        </div>

        {/* Everyone else: people with a story (rainbow ring = new, grey ring = seen) and suggested accounts (plus badge) */}
        {model.items.map((item) => {
          if (item.kind === 'story') {
            return (
              <button
                key={`story-${item.userId}`}
                id={`story-item-${item.userId}`}
                onClick={() => onOpenStoryViewer(item.startIndex)}
                className="flex flex-col items-center flex-shrink-0 group cursor-pointer"
                title={`View ${item.username}'s Story`}
              >
                <RingedAvatar ring={item.ring} closeFriends={item.closeFriends} src={item.avatar} alt={item.username} />
                <div className="flex items-center gap-0.5 mt-1 max-w-[68px]">
                  <span className={`text-[10px] truncate font-normal tracking-tight ${item.ring === 'seen' ? 'text-zinc-500 group-hover:text-zinc-300' : 'text-zinc-300 group-hover:text-white'}`}>
                    {item.username}
                  </span>
                  {item.closeFriends && (
                    <span className="w-1.5 h-1.5 rounded-full bg-noob flex-shrink-0 shadow-[0_0_6px_rgba(217,119,87,0.8)]" title="Close Friends" />
                  )}
                </div>
              </button>
            );
          }
          const state = followState(item.userId);
          return (
            <div key={`suggested-${item.userId}`} id={`story-suggested-${item.userId}`} className="flex flex-col items-center flex-shrink-0 group">
              <div className="relative">
                <button
                  onClick={() => openSuggestionProfile(item)}
                  className="block cursor-pointer"
                  title={`View ${item.username}'s profile`}
                  aria-label={`View ${item.username}'s profile`}
                >
                  <RingedAvatar ring="none" src={item.avatar} alt={item.username} />
                </button>
                <button
                  onClick={() => followSuggestion(item)}
                  disabled={state !== 'none' || busy.has(item.userId) || !onToggleFollowUser}
                  title={state === 'following' ? 'Following' : state === 'requested' ? 'Requested' : `Follow ${item.username}`}
                  aria-label={state === 'following' ? `Following ${item.username}` : state === 'requested' ? `Follow requested for ${item.username}` : `Follow ${item.username}`}
                  className={`absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-black shadow-sm text-white transition-colors ${
                    state === 'following' ? 'bg-emerald-500' : state === 'requested' ? 'bg-zinc-600' : 'bg-sky-500 hover:bg-sky-400 cursor-pointer'
                  } ${busy.has(item.userId) ? 'opacity-60' : ''}`}
                >
                  {state === 'following' ? <Check className="w-3 h-3 stroke-[3]" /> : state === 'requested' ? <Clock className="w-3 h-3 stroke-[3]" /> : <Plus className="w-3 h-3 stroke-[3]" />}
                </button>
              </div>
              <span className="text-[10px] text-zinc-300 group-hover:text-white truncate font-normal tracking-tight mt-1 max-w-[68px]">{item.username}</span>
            </div>
          );
        })}
      </div>

      {/* Enlarged Status Note Viewer with Auto-playing Song */}
      {selectedNoteViewer && (
        <StatusNoteViewerModal
          note={selectedNoteViewer.note}
          user={selectedNoteViewer.user}
          isCurrentUser={selectedNoteViewer.isCurrentUser}
          onClose={() => setSelectedNoteViewer(null)}
          onOpenEditNote={() => {
            setSelectedNoteViewer(null);
            onOpenStatusNoteModal();
          }}
          onClearNote={() => {
            if (onClearStatusNote) onClearStatusNote();
            setSelectedNoteViewer(null);
          }}
        />
      )}
    </div>
  );
};
