import React, { useEffect, useState } from 'react';
import { Plus, Archive } from 'lucide-react';
import { User } from '../../types';
import { fetchInstantInbox } from '../../services/api';
import type { InstantInboxItem } from '../../services/api';

interface InstantsStackProps {
  currentUser: User;
  onOpenCamera: () => void;
  onOpenViewer: (queue: InstantInboxItem[]) => void;
  onOpenArchive: () => void;
  refreshKey: number; // bump this after sending/viewing an instant to refetch the inbox
}

// The tilted grey "+" box at the top of the Chat page, Instagram Instants-style — tap it to take a photo,
// or tap a friend's tilted thumbnail next to it to open what they sent. "Your Instants" (the little archive
// icon) is your own private history — friends never see it.
export const InstantsStack: React.FC<InstantsStackProps> = ({ currentUser, onOpenCamera, onOpenViewer, onOpenArchive, refreshKey }) => {
  const [inbox, setInbox] = useState<InstantInboxItem[]>([]);

  useEffect(() => {
    fetchInstantInbox().then((res) => { if (res.success) setInbox(res.instants); });
  }, [refreshKey]);

  // Group by sender so tapping one friend's thumbnail opens just their instant(s), oldest first.
  const bySender = inbox.reduce<{ sender: InstantInboxItem['sender']; items: InstantInboxItem[] }[]>((acc, item) => {
    const existing = acc.find((g) => g.sender.userId === item.sender.userId);
    if (existing) existing.items.push(item);
    else acc.push({ sender: item.sender, items: [item] });
    return acc;
  }, []);

  return (
    <div className="px-3 py-2.5 border-b border-zinc-900 flex items-center gap-3 overflow-x-auto no-scrollbar">
      <button
        type="button"
        onClick={onOpenCamera}
        title="Take an instant"
        className="shrink-0 w-14 h-14 rounded-2xl bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center rotate-[-6deg] hover:rotate-0 hover:border-[#00FF66] transition-all cursor-pointer"
      >
        <Plus className="w-6 h-6 text-zinc-300" />
      </button>

      {bySender.map((group) => (
        <button
          key={group.sender.userId}
          type="button"
          onClick={() => onOpenViewer(group.items)}
          title={`Open ${group.sender.displayName || group.sender.username}'s instant`}
          className="shrink-0 relative w-14 h-14 rounded-2xl overflow-hidden rotate-[4deg] hover:rotate-0 transition-transform cursor-pointer ring-2 ring-[#00FF66]"
        >
          <img src={group.sender.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          {group.items.length > 1 && (
            <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold bg-black/70 text-white px-1 rounded-full">{group.items.length}</span>
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={onOpenArchive}
        title="Your Instants"
        className="shrink-0 relative w-14 h-14 rounded-2xl overflow-hidden rotate-[-3deg] hover:rotate-0 transition-transform cursor-pointer border border-zinc-700"
      >
        <img src={currentUser.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
        <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Archive className="w-4 h-4 text-white" />
        </span>
      </button>
    </div>
  );
};
