import React, { useEffect, useState } from 'react';
import { X, Users, Plus, Mic, Music2, Images, Gamepad2, MessageSquareQuote } from 'lucide-react';
import { NoobRoom, NoobRoomActivityType, User } from '../../types';
import { listNoobRooms, startNoobRoom } from '../../services/api';
import { NoobVoiceRoomView } from './NoobVoiceRoomView';

interface NoobRoomsLobbyViewProps {
  currentUser: User;
  onClose: () => void;
}

const ACTIVITY_META: Record<NoobRoomActivityType, { label: string; icon: React.ReactNode; color: string }> = {
  guess_song: { label: 'Guess the Song', icon: <Music2 className="w-5 h-5" />, color: 'bg-purple-500/15 border-purple-500/30 text-purple-300' },
  meme_battle: { label: 'Meme Battle', icon: <Images className="w-5 h-5" />, color: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  mini_game: { label: 'Mini Game Room', icon: <Gamepad2 className="w-5 h-5" />, color: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' },
  truth_or_dare: { label: 'Truth or Dare', icon: <MessageSquareQuote className="w-5 h-5" />, color: 'bg-red-500/15 border-red-500/30 text-red-300' }
};

const CATEGORIES = ['General', 'Vibe', 'Gaming', 'Study'];

export const NoobRoomsLobbyView: React.FC<NoobRoomsLobbyViewProps> = ({ currentUser, onClose }) => {
  const [rooms, setRooms] = useState<NoobRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRoom, setOpenRoom] = useState<NoobRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = () => { listNoobRooms().then((r) => { setRooms(r); setLoading(false); }); };
  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError('');
    const res = await startNoobRoom(name, newCategory);
    setCreating(false);
    if (!res.success || !res.roomId) {
      setCreateError(res.error || 'Could not start the room.');
      return;
    }
    setShowCreate(false);
    setNewName('');
    setOpenRoom({ id: res.roomId, name, category: newCategory, activityType: null, participantCount: 0, host: null, createdAt: new Date().toISOString() });
  };

  if (openRoom) {
    return <NoobVoiceRoomView currentUser={currentUser} room={openRoom} onClose={() => { setOpenRoom(null); load(); }} />;
  }

  const activityRooms = rooms.filter((r) => r.activityType);
  const voiceRooms = rooms.filter((r) => !r.activityType);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black italic tracking-tighter text-white">🔴 NOOB Rooms</h1>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 max-w-2xl mx-auto w-full">
        {activityRooms.length > 0 && (
          <div className="space-y-2.5">
            {activityRooms.map((r) => {
              const meta = ACTIVITY_META[r.activityType!];
              return (
                <button
                  key={r.id}
                  onClick={() => setOpenRoom(r)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border ${meta.color} cursor-pointer text-left`}
                >
                  {meta.icon}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-white block">{meta.label}</span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {r.participantCount} {r.participantCount === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Live voice rooms</span>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 bg-[#00FF66] text-black rounded-full pl-2 pr-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Start a room
            </button>
          </div>
          {loading ? (
            <div className="py-10 text-center text-zinc-500 text-xs">Loading rooms…</div>
          ) : voiceRooms.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-xs">No one's hosting a room right now — start one!</div>
          ) : (
            <div className="space-y-2.5">
              {voiceRooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenRoom(r)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:border-[#00FF66]/40 transition-colors cursor-pointer text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <Mic className="w-4.5 h-4.5 text-zinc-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-white block truncate">{r.name}</span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <span>{r.category}</span>
                      <span>•</span>
                      <Users className="w-3 h-3" /> {r.participantCount}
                      {r.host && <span>• hosted by @{r.host.username}</span>}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setShowCreate(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <h2 className="text-sm font-bold text-white">Start a voice room</h2>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder="Room name, e.g. Late Night Vibes"
              autoFocus
              className="w-full bg-black rounded-xl border border-zinc-700 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
            />
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                    newCategory === c ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {createError && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{createError}</div>}
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm disabled:opacity-40 cursor-pointer"
            >
              {creating ? 'Starting…' : 'Start room'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
