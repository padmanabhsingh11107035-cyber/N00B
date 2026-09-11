import React, { useState } from 'react';
import { Plus, Volume2 } from 'lucide-react';
import { Story, User, StatusNote } from '../../types';
import { StatusNoteViewerModal } from '../Modals/StatusNoteViewerModal';

interface StoryTrayProps {
  currentUser: User;
  stories: Story[];
  posts?: any[];
  reels?: any[];
  onOpenStoryViewer: (storyIndex: number) => void;
  onOpenCreateStory: () => void;
  onOpenStatusNoteModal: () => void;
  onClearStatusNote?: () => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToReel?: (reelId: string) => void;
}

export const StoryTray: React.FC<StoryTrayProps> = ({
  currentUser,
  stories,
  onOpenStoryViewer,
  onOpenCreateStory,
  onOpenStatusNoteModal,
  onClearStatusNote
}) => {
  const [selectedNoteViewer, setSelectedNoteViewer] = useState<{
    note: StatusNote;
    user: { id?: string; username: string; displayName?: string; avatar?: string };
    isCurrentUser: boolean;
  } | null>(null);

  // Check 24-hour expiration for status note
  const isMyNoteValid =
    currentUser.statusNote &&
    (!currentUser.statusNote.expiresAt || Date.now() < currentUser.statusNote.expiresAt);

  // Deduplicate stories by user or show unique story entries
  const uniqueStories: Story[] = [];
  const seenUserIds = new Set<string>();

  for (const s of stories) {
    const key = s.userId || s.username;
    if (!seenUserIds.has(key)) {
      seenUserIds.add(key);
      uniqueStories.push(s);
    }
  }

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
            className="mb-1 max-w-[86px] bg-zinc-900/95 border border-[#00FF66]/50 rounded-full px-2 py-0.5 text-[9px] text-[#00FF66] font-semibold truncate shadow-md hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
            title={isMyNoteValid ? "Click to expand note & play song" : "Add Status Note (24-hour lifespan)"}
          >
            {isMyNoteValid && currentUser.statusNote ? (
              <>
                <span className="truncate">{currentUser.statusNote.text}</span>
                {currentUser.statusNote.musicTrack && (
                  <Volume2 className="w-2.5 h-2.5 flex-shrink-0 animate-pulse text-[#00FF66]" />
                )}
              </>
            ) : (
              <span className="text-zinc-400 font-medium">+ Note</span>
            )}
          </button>

          {/* User Avatar with + icon */}
          <div className="relative">
            <button
              id="create-story-btn"
              onClick={onOpenCreateStory}
              className="w-14 h-14 rounded-full p-[2px] bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center justify-center cursor-pointer relative"
              title="Add to Story"
            >
              <img
                src={currentUser.avatar || '/noob-logo.svg.jpeg'}
                alt="My Story"
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#00FF66] text-black rounded-full flex items-center justify-center border-2 border-black shadow-sm">
                <Plus className="w-3 h-3 stroke-[3]" />
              </div>
            </button>
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 font-medium tracking-tight">Your story</span>
        </div>

        {/* Active Stories from Following */}
        {uniqueStories.map((story) => (
          <button
            key={story.id}
            id={`story-item-${story.id}`}
            onClick={() => onOpenStoryViewer(stories.findIndex((s) => s.id === story.id))}
            className="flex flex-col items-center flex-shrink-0 group cursor-pointer"
            title={`View ${story.username}'s Story`}
          >
            <div
              className={`w-14 h-14 rounded-full p-[2px] transition-transform duration-200 group-hover:scale-105 ${
                story.isCloseFriendsOnly
                  ? 'bg-gradient-to-tr from-[#00FF66] via-emerald-400 to-green-300 shadow-[0_0_10px_rgba(0,255,102,0.3)]'
                  : 'bg-gradient-to-tr from-rose-500 via-amber-400 via-emerald-400 via-sky-500 to-purple-600 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
              }`}
            >
              <div className="w-full h-full rounded-full p-[2px] bg-black">
                <img
                  src={story.userAvatar || '/noob-logo.svg.jpeg'}
                  alt={story.username}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <div className="flex items-center gap-0.5 mt-1 max-w-[68px]">
              <span className="text-[10px] text-zinc-300 group-hover:text-white truncate font-normal tracking-tight">
                {story.username}
              </span>
              {story.isCloseFriendsOnly && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] flex-shrink-0 shadow-[0_0_6px_rgba(0,255,102,0.8)]" title="Close Friends" />
              )}
            </div>
          </button>
        ))}
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
