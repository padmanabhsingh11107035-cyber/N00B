import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Users,
  Heart,
  Send,
  Sparkles,
  Mic,
  MicOff,
  Video,
  VideoOff,
  UserPlus
} from 'lucide-react';
import { User } from '../../types';
import confetti from 'canvas-confetti';

interface LiveRoomModalProps {
  currentUser: User;
  onClose: () => void;
}

export const LiveRoomModal: React.FC<LiveRoomModalProps> = ({ currentUser, onClose }) => {
  const [viewerCount, setViewerCount] = useState(1420);
  const [messages, setMessages] = useState<{ id: string; user: string; text: string }[]>([
    { id: '1', user: 'elena_robotics', text: 'Watching from Tokyo! 🚀' },
    { id: '2', user: 'kai_cad_craft', text: 'Audio quality is crystal clean!' },
    { id: '3', user: 'clara_dev', text: 'Can you show the dual camera feed?' }
  ]);
  const [commentInput, setCommentInput] = useState('');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [guests, setGuests] = useState<string[]>(['elena_robotics']);

  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount((v) => v + Math.floor(Math.random() * 7) - 2);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    setMessages([
      ...messages,
      { id: String(Date.now()), user: currentUser.username, text: commentInput.trim() }
    ]);
    setCommentInput('');
  };

  const handleSendHeart = () => {
    confetti({
      particleCount: 20,
      spread: 40,
      origin: { y: 0.9, x: 0.9 }
    });
  };

  const handleAddGuest = () => {
    if (guests.length < 3) {
      setGuests([...guests, 'synth_wave_rider']);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-lg bg-[#0c0c0c] border border-red-500/40 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
        {/* Top Header */}
        <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 bg-red-600 text-white font-black text-[10px] uppercase px-2 py-0.5 rounded-full animate-pulse">
              <Radio className="w-3 h-3" /> Live Room
            </span>
            <span className="text-xs text-gray-300 font-semibold flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#00FF66]" /> {viewerCount.toLocaleString()} watching
            </span>
          </div>

          <div className="flex items-center gap-2">
            {guests.length < 3 && (
              <button
                onClick={handleAddGuest}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-[#00FF66] text-xs font-bold rounded-full flex items-center gap-1"
                title="Invite Guest Co-Host (Up to 3)"
              >
                <UserPlus className="w-3.5 h-3.5" /> + Guest ({guests.length}/3)
              </button>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Grid Stream Video Tiles */}
        <div className={`flex-1 grid gap-1.5 p-2 bg-black ${guests.length === 1 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
          {/* Host Tile */}
          <div className="relative bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center border border-[#00FF66]/40">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80"
              alt="Host Stream"
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] text-white font-bold">
              👑 {currentUser.username} (Host)
            </span>
          </div>

          {/* Guest Tiles */}
          {guests.map((g, idx) => (
            <div key={idx} className="relative bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800">
              <img
                src={
                  idx === 0
                    ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80'
                    : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80'
                }
                alt="Guest Stream"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-[10px] text-[#00E5FF] font-bold">
                @{g} (Guest)
              </span>
            </div>
          ))}
        </div>

        {/* Floating Live Chat Overlay */}
        <div className="px-3 py-2 bg-neutral-950/90 border-t border-neutral-800 flex flex-col justify-end max-h-44">
          <div className="overflow-y-auto space-y-1.5 pr-2 mb-2 max-h-28 no-scrollbar">
            {messages.map((m) => (
              <div key={m.id} className="text-xs text-gray-300">
                <span className="font-bold text-[#00FF66] mr-1.5">@{m.user}:</span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>

          {/* Bottom Live Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMicOn(!isMicOn)}
              className={`p-2 rounded-full border ${
                isMicOn ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-red-500 text-white border-red-500'
              }`}
            >
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            <form onSubmit={handleSendComment} className="flex-1 flex items-center bg-neutral-900 border border-neutral-700 rounded-full px-3 py-1.5">
              <input
                type="text"
                placeholder="Comment in Live Room..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                className="w-full bg-transparent text-xs text-white focus:outline-none"
              />
              <button type="submit" className="text-[#00FF66] ml-1">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <button
              onClick={handleSendHeart}
              className="p-2 bg-red-600/20 border border-red-500/50 text-red-500 rounded-full hover:scale-110 active:scale-125 transition-transform"
            >
              <Heart className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
