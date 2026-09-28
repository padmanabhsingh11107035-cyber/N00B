import React, { useEffect, useState } from 'react';
import { X, Loader2, Trash2, UserPlus } from 'lucide-react';
import { fetchInstantsArchive, deleteInstant } from '../../services/api';
import type { InstantArchiveItem } from '../../services/api';
import { formatExactDateTime } from '../../utils/formatTime';

interface InstantsArchiveProps {
  onClose: () => void;
  onOpenCloseFriends: () => void;
}

const dayGroup = (iso: string): string => {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
};

// "Your Instants" — nobody else ever sees this: every instant you've sent (recent ones still live for
// friends, older ones just kept here as your own private record), grouped by when, with who reacted.
export const InstantsArchive: React.FC<InstantsArchiveProps> = ({ onClose, onOpenCloseFriends }) => {
  const [items, setItems] = useState<InstantArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchInstantsArchive().then((res) => {
      if (res.success) setItems(res.instants);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteInstant(id);
    if (res.success) setItems((prev) => prev.filter((i) => i.id !== id));
    setDeletingId(null);
  };

  const groups = items.reduce<Record<string, InstantArchiveItem[]>>((acc, item) => {
    const g = dayGroup(item.createdAt);
    (acc[g] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        <header className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-white">Your Instants</h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenCloseFriends}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" /> Close Friends
            </button>
            <button onClick={onClose} className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#00FF66]" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-10">Nothing here yet — instants you send stick around here after they're gone from your friends' inbox.</p>
          ) : (
            ['Today', 'Yesterday', 'This week', 'Earlier'].filter((g) => groups[g]?.length).map((g) => (
              <div key={g} className="space-y-2.5">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">{g}</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {groups[g].map((item) => (
                    <div key={item.id} className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-square group">
                      <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                        <span className="text-[9px] text-zinc-300 block">{formatExactDateTime(item.createdAt)}</span>
                        <span className="text-[9px] text-zinc-400 block">Sent to {item.sentTo} • {item.audience === 'close_friends' ? 'Close Friends' : 'Friends'}</span>
                        {item.reactions.length > 0 && (
                          <span className="text-[10px] block truncate">{item.reactions.map((r) => r.emoji).join(' ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
