import React, { useState } from 'react';
import { X, Music, MapPin, Sparkles, Volume2 } from 'lucide-react';
import { User, StatusNote } from '../../types';
import confetti from 'canvas-confetti';

interface StatusNoteModalProps {
  currentUser: User;
  onClose: () => void;
  onSaveNote: (note: StatusNote | undefined) => void;
}

const MUSIC_SNIPPETS = [
  'Synthwave Odyssey (0:30)',
  'Cyberpunk 2077 Night Drive',
  'Lo-Fi Coding Beats (0:30)',
  'Robotics Studio Lab Ambience'
];

export const StatusNoteModal: React.FC<StatusNoteModalProps> = ({
  currentUser,
  onClose,
  onSaveNote
}) => {
  const [noteText, setNoteText] = useState(currentUser.statusNote?.text || '');
  const [selectedMusic, setSelectedMusic] = useState(currentUser.statusNote?.musicTrack || '');
  const [locationTag, setLocationTag] = useState(currentUser.statusNote?.location || '');

  const handleSave = () => {
    if (!noteText.trim()) {
      onSaveNote(undefined);
    } else {
      const now = Date.now();
      onSaveNote({
        text: noteText.trim().slice(0, 60),
        musicTrack: selectedMusic || undefined,
        location: locationTag || undefined,
        createdAt: 'Just now',
        createdAtTimestamp: now,
        expiresAt: now + 24 * 60 * 60 * 1000 // 24 hours from creation
      });
      confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#111111] border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Update Status Note</h3>
            <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
              ⏳ 24h Expiry
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Note Input bubble simulation */}
        <div className="flex flex-col items-center py-2">
          <div className="relative mb-2">
            <div className="bg-[#181818] border border-[#00FF66] rounded-2xl px-4 py-2 text-xs text-white shadow-xl max-w-[240px] text-center font-medium">
              <input
                type="text"
                maxLength={60}
                placeholder="Share a thought (up to 60 chars)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full bg-transparent text-center text-xs text-white placeholder-gray-500 focus:outline-none"
                autoFocus
              />
              <span className="text-[9px] text-gray-500 block text-right mt-1">
                {noteText.length}/60
              </span>
            </div>
            {/* Bubble pointer tail */}
            <div className="w-3 h-3 bg-[#181818] border-r border-b border-[#00FF66] rotate-45 mx-auto -mt-1.5" />
          </div>

          <img
            src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
            alt=""
            className="w-16 h-16 rounded-full object-cover ring-2 ring-[#00FF66] mt-1"
          />
        </div>

        {/* Add Music Snippet */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
            Add Music Snippet
          </label>
          <div className="space-y-1">
            {MUSIC_SNIPPETS.map((song) => (
              <button
                key={song}
                onClick={() => setSelectedMusic(selectedMusic === song ? '' : song)}
                className={`w-full p-2 rounded-xl text-xs flex items-center justify-between border transition-all ${
                  selectedMusic === song
                    ? 'bg-[#00FF66]/15 border-[#00FF66] text-[#00FF66] font-bold'
                    : 'bg-neutral-900 border-neutral-800 text-gray-300 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Music className="w-3.5 h-3.5 text-[#00FF66]" /> {song}
                </span>
                {selectedMusic === song && <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
              </button>
            ))}
          </div>
        </div>

        {/* Location Tag */}
        <div>
          <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">
            Status Location (Optional)
          </label>
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#00FF66] mr-2" />
            <input
              type="text"
              placeholder="e.g. Robotics Lab, Akihabara..."
              value={locationTag}
              onChange={(e) => setLocationTag(e.target.value)}
              className="w-full bg-transparent text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
          <button
            onClick={() => {
              onSaveNote(undefined);
              onClose();
            }}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
          >
            Clear Note
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-[#00FF66] text-black font-bold text-xs rounded-xl hover:scale-105 transition-transform"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
};
