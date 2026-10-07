import React, { useEffect, useState } from 'react';
import { X, Users, Plus, Music2, Images, Gamepad2, MessageSquareQuote, Radio, PowerOff } from 'lucide-react';
import { NoobRoom, NoobRoomActivityType, User } from '../../types';
import { listNoobRooms, startNoobRoom, fetchPublicPlatformSettings } from '../../services/api';
import { isMainAdmin } from '../../adminAccess';

// Agora (plus everything NoobVoiceRoomView pulls in for it) only needs to load once someone actually
// joins a room — bundling it into the lobby's own chunk made just opening the room LIST slow, which
// is almost certainly why "NOOB Rooms" felt like it did nothing for a long stretch after being tapped.
const NoobVoiceRoomView = React.lazy(() => import('./NoobVoiceRoomView').then((m) => ({ default: m.NoobVoiceRoomView })));

interface NoobRoomsLobbyViewProps {
  currentUser: User;
  onClose: () => void;
}

const ACTIVITY_META: Record<NoobRoomActivityType, { label: string; icon: React.ReactNode; color: string }> = {
  guess_song: { label: 'Guess the Song', icon: <Music2 className="w-6 h-6" />, color: 'from-purple-500/25 to-purple-500/5 border-purple-500/30 text-purple-300' },
  meme_battle: { label: 'Meme Battle', icon: <Images className="w-6 h-6" />, color: 'from-amber-500/25 to-amber-500/5 border-amber-500/30 text-amber-300' },
  mini_game: { label: 'Mini Game Room', icon: <Gamepad2 className="w-6 h-6" />, color: 'from-cyan-500/25 to-cyan-500/5 border-cyan-500/30 text-cyan-300' },
  truth_or_dare: { label: 'Truth or Dare', icon: <MessageSquareQuote className="w-6 h-6" />, color: 'from-red-500/25 to-red-500/5 border-red-500/30 text-red-300' }
};

// Known categories get their own colored tile + emoji so the lobby reads at a glance; a custom
// category typed on the create form still works fine, it just falls back to a plain mic tile.
const CATEGORY_STYLE: Record<string, { emoji: string; color: string }> = {
  Vibe: { emoji: '🎧', color: 'from-pink-500/20 to-pink-500/5 border-pink-500/30' },
  Gaming: { emoji: '🎮', color: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/30' },
  Study: { emoji: '📚', color: 'from-sky-500/20 to-sky-500/5 border-sky-500/30' },
  General: { emoji: '🎙️', color: 'from-zinc-700/40 to-zinc-800/10 border-zinc-700' }
};
const DEFAULT_CATEGORY_STYLE = { emoji: '🎙️', color: 'from-emerald-500/15 to-emerald-500/5 border-[#00FF66]/30' };

const SUGGESTED_CATEGORIES = ['Vibe', 'Gaming', 'Study', 'General'];

// A visible spinner instead of a blank Suspense fallback — the room-view chunk (Agora + everything it
// needs) can take a few seconds on a slow connection, and showing nothing during that made it look
// like the tap did nothing at all.
export const RoomLoadingSpinner: React.FC = () => (
  <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-[#00FF66] animate-spin" />
    <p className="text-zinc-400 text-sm">Connecting…</p>
  </div>
);

export const NoobRoomsLobbyView: React.FC<NoobRoomsLobbyViewProps> = ({ currentUser, onClose }) => {
  const [rooms, setRooms] = useState<NoobRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRoom, setOpenRoom] = useState<NoobRoom | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Vibe');
  const [customCategory, setCustomCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Admin on/off switch for cutting NOOB Rooms' Supabase egress on demand — checked BEFORE anything
  // else starts polling, since the whole point of turning it off is that nothing here should make any
  // of these calls at all, not just have the server reject them. Admin stays exempt (can still open it
  // to test), same as every other maintenance-style lock in this app.
  const [lock, setLock] = useState<{ checked: boolean; locked: boolean; message: string }>({ checked: false, locked: false, message: '' });
  useEffect(() => {
    fetchPublicPlatformSettings().then((s) =>
      setLock({ checked: true, locked: s.noobRoomsEnabled === false, message: s.noobRoomsDisabledMessage || 'NOOB Rooms is turned off right now. Check back soon.' })
    );
  }, []);
  const blocked = lock.locked && !isMainAdmin(currentUser);

  const load = () => { listNoobRooms().then((r) => { setRooms(r); setLoading(false); }); };
  useEffect(() => {
    if (!lock.checked || blocked) return;
    load();
    // 25s, not a few seconds — this is just a browsing list (no realtime channel backs it), so it
    // doesn't need to be near-instant, and polling it aggressively was pure wasted Supabase egress.
    const interval = setInterval(load, 25000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.checked, blocked]);

  // Warms the Agora SDK's chunk the moment the lobby opens, so it's already downloaded by the time
  // someone taps a room instead of only starting that fetch at the moment they're trying to connect.
  useEffect(() => {
    if (!lock.checked || blocked) return;
    void import('agora-rtc-sdk-ng');
  }, [lock.checked, blocked]);

  const effectiveCategory = () => (customCategory.trim() ? customCategory.trim() : newCategory);

  const handleCreate = async () => {
    const name = newName.trim();
    const category = effectiveCategory();
    if (!name || !category) return;
    setCreating(true);
    setCreateError('');
    const res = await startNoobRoom(name, category, newDescription.trim());
    setCreating(false);
    if (!res.success || !res.roomId) {
      setCreateError(res.error || 'Could not start the room.');
      return;
    }
    setShowCreate(false);
    setNewName('');
    setCustomCategory('');
    setNewDescription('');
    setOpenRoom({
      id: res.roomId,
      name,
      category,
      description: newDescription.trim(),
      activityType: null,
      participantCount: 0,
      host: null,
      createdAt: new Date().toISOString()
    });
  };

  if (openRoom) {
    return (
      <React.Suspense fallback={<RoomLoadingSpinner />}>
        <NoobVoiceRoomView currentUser={currentUser} room={openRoom} onClose={() => { setOpenRoom(null); load(); }} />
      </React.Suspense>
    );
  }

  if (!lock.checked) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-[#00FF66] animate-spin" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"><X className="w-6 h-6" /></button>
        <PowerOff className="w-10 h-10 text-zinc-600" />
        <h2 className="text-white text-base font-semibold">NOOB Rooms is turned off</h2>
        <p className="text-zinc-500 text-sm max-w-sm">{lock.message}</p>
      </div>
    );
  }

  const activityRooms = rooms.filter((r) => r.activityType);
  const voiceRooms = rooms.filter((r) => !r.activityType);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black italic tracking-tighter text-white flex items-center gap-2">
          <Radio className="w-4.5 h-4.5 text-red-500" /> NOOB Rooms
        </h1>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-7 max-w-2xl mx-auto w-full">
        {activityRooms.length > 0 && (
          <div className="space-y-3">
            {activityRooms.map((r) => {
              const meta = ACTIVITY_META[r.activityType!];
              return (
                <button
                  key={r.id}
                  onClick={() => setOpenRoom(r)}
                  className={`w-full flex items-center gap-4 p-5 rounded-3xl border bg-gradient-to-br ${meta.color} cursor-pointer text-left transition-transform hover:scale-[1.01]`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-black/30 flex items-center justify-center shrink-0">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-base font-black text-white block">{meta.label}</span>
                    {r.description && <p className="text-[11px] text-zinc-300/80 mt-0.5 line-clamp-1">{r.description}</p>}
                    <span className="text-xs font-bold flex items-center gap-1 mt-1.5">
                      <Users className="w-3.5 h-3.5" /> {r.participantCount} {r.participantCount === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Live voice rooms</span>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 bg-[#00FF66] text-black rounded-full pl-2.5 pr-3.5 py-2 text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Start a room
            </button>
          </div>
          {loading ? (
            <div className="py-10 text-center text-zinc-500 text-xs">Loading rooms…</div>
          ) : voiceRooms.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-xs">No one's hosting a room right now — start one!</div>
          ) : (
            <div className="space-y-3">
              {voiceRooms.map((r) => {
                const style = CATEGORY_STYLE[r.category] || DEFAULT_CATEGORY_STYLE;
                return (
                  <button
                    key={r.id}
                    onClick={() => setOpenRoom(r)}
                    className={`w-full flex items-center gap-4 p-4 rounded-3xl border bg-gradient-to-br ${style.color} hover:border-[#00FF66]/50 transition-all cursor-pointer text-left`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-black/30 flex items-center justify-center shrink-0 text-2xl">{style.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white truncate">{r.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/30 text-zinc-300 font-bold uppercase shrink-0">{r.category}</span>
                      </div>
                      {r.description && <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{r.description}</p>}
                      <span className="text-[11px] text-zinc-300 font-semibold flex items-center gap-1 mt-1">
                        <Users className="w-3 h-3" /> {r.participantCount} {r.participantCount === 1 ? 'person' : 'people'}
                        {r.host && <span className="text-zinc-500 font-normal">• hosted by @{r.host.username}</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setShowCreate(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-3.5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto"
          >
            <h2 className="text-sm font-bold text-white">Start a voice room</h2>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Room name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Late Night Vibes"
                autoFocus
                className="w-full bg-black rounded-xl border border-zinc-700 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Category</label>
              <div className="flex gap-2 flex-wrap">
                {SUGGESTED_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setNewCategory(c); setCustomCategory(''); }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                      newCategory === c && !customCategory.trim() ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                maxLength={30}
                placeholder="Or type your own category…"
                className="w-full bg-black rounded-xl border border-zinc-700 px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Description (optional)</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="What's this room about?"
                className="w-full bg-black rounded-xl border border-zinc-700 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66] resize-none"
              />
            </div>

            {createError && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{createError}</div>}
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !effectiveCategory()}
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
