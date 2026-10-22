import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchInstantInbox } from '../../services/api';
import type { InstantInboxItem } from '../../services/api';

interface InstantsStackProps {
  onOpenCamera: () => void;
  onOpenViewer: (queue: InstantInboxItem[]) => void;
  refreshKey: number; // bump this after sending/viewing an instant to refetch the inbox
}

export interface InstantGroup { sender: InstantInboxItem['sender']; items: InstantInboxItem[] }

// Instagram's Instants, the way it shows them in the inbox: nothing across the top of the page any more (it used to take about a fifth of the screen), just a small grey "+" tab that
// sits at the right edge, half tucked away, above the bottom of the chat list. Tap it to take a photo. When friends have sent you instants, their tilted thumbnails are stacked above
// the tab: tap one to open what that friend sent. "Your Instants" (your own private history, friends never see it) is in the ⋮ menu of the page.
export const InstantsFloating: React.FC<{ groups: InstantGroup[]; onOpenCamera: () => void; onOpenViewer: (queue: InstantInboxItem[]) => void }> = ({ groups, onOpenCamera, onOpenViewer }) => {
  const shown = groups.slice(0, 3);
  const more = groups.length - shown.length;
  return (
    // the wrapper is narrower than the tab, so the right part of every piece is tucked behind the edge of the list, like Instagram's
    <div className="absolute right-0 bottom-14 z-30 w-[54px] overflow-hidden pointer-events-none py-3" data-testid="instants-floating">
      <div className="flex flex-col items-start gap-2.5 pl-1.5">
        {shown.map((group, i) => (
          <button
            key={group.sender.userId}
            type="button"
            onClick={() => onOpenViewer(group.items)}
            title={`Open ${group.sender.displayName || group.sender.username}'s instant`}
            aria-label={`Open ${group.sender.displayName || group.sender.username}'s instant`}
            data-testid="instants-friend"
            className="pointer-events-auto shrink-0 relative w-[58px] h-[68px] rounded-[20px] overflow-hidden ring-2 ring-noob shadow-xl cursor-pointer transition-transform hover:scale-105 active:scale-95"
            style={{ transform: `rotate(${i % 2 ? 7 : -5}deg)` }}
          >
            <img src={group.sender.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            {group.items.length > 1 && (
              <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/75 text-white px-1.5 rounded-full">{group.items.length}</span>
            )}
          </button>
        ))}
        {more > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-zinc-800/95 border border-white/10 text-[10px] font-black text-zinc-200">+{more}</span>}
        <button
          type="button"
          onClick={onOpenCamera}
          title="Take an instant"
          aria-label="Take an instant"
          data-testid="instants-add"
          className="pointer-events-auto shrink-0 w-[74px] h-[84px] rounded-[26px] bg-zinc-700/90 backdrop-blur-md border border-white/10 shadow-xl flex items-center justify-start pl-[18px] rotate-[-7deg] hover:bg-zinc-600/90 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-8 h-8 text-white" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export const InstantsStack: React.FC<InstantsStackProps> = ({ onOpenCamera, onOpenViewer, refreshKey }) => {
  const [inbox, setInbox] = useState<InstantInboxItem[]>([]);

  useEffect(() => {
    fetchInstantInbox().then((res) => { if (res.success) setInbox(res.instants); });
  }, [refreshKey]);

  // Group by sender so tapping one friend's thumbnail opens just their instant(s), oldest first.
  const bySender = inbox.reduce<InstantGroup[]>((acc, item) => {
    const existing = acc.find((g) => g.sender.userId === item.sender.userId);
    if (existing) existing.items.push(item);
    else acc.push({ sender: item.sender, items: [item] });
    return acc;
  }, []);

  return <InstantsFloating groups={bySender} onOpenCamera={onOpenCamera} onOpenViewer={onOpenViewer} />;
};
