import React, { useState } from 'react';
import { MessageSquare, Smile, X } from 'lucide-react';
import { soundEffects } from '../audio/soundEffects';

interface EmotePickerProps {
  onSendEmote: (text: string) => void;
}

const PREDEFINED_EMOTES = [
  '😂',
  '🔥',
  '😎',
  '👑',
  'GG',
  'Nice!',
  'Oops!',
  'Lucky!',
  'Comeback!',
  "Let's go!",
  'Well played!',
  'No mercy!',
];

export const EmotePicker: React.FC<EmotePickerProps> = ({ onSendEmote }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (item: string) => {
    soundEffects.playButtonClick();
    onSendEmote(item);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          soundEffects.playButtonClick();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs md:text-sm font-bold shadow-md transition-all active:scale-95"
        aria-label="Open Emotes"
      >
        <Smile className="w-4 h-4 text-amber-400" />
        <span>Emotes</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-12 left-0 z-50 w-64 md:w-72 p-3 bg-slate-900/95 border border-indigo-500/40 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-black text-indigo-300 uppercase tracking-wider">
              <MessageSquare className="w-3.5 h-3.5" />
              Quick Chat & Emotes
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {PREDEFINED_EMOTES.map((emote) => (
              <button
                key={emote}
                onClick={() => handleSelect(emote)}
                className="py-1.5 px-1 rounded-xl bg-slate-800/80 hover:bg-indigo-600/40 hover:border-indigo-400/50 border border-slate-700/60 text-xs font-extrabold text-slate-100 transition-all active:scale-95 text-center truncate"
              >
                {emote}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
