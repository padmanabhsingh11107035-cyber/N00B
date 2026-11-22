import React from 'react';
import { X, Instagram, Youtube, ExternalLink } from 'lucide-react';

interface FollowUsModalProps {
  onClose: () => void;
}

const INSTAGRAM_URL = 'https://www.instagram.com/noobsocials';
const YOUTUBE_URL = 'https://www.youtube.com/@noobsocials_456';
const FOUNDER_URL = 'https://www.instagram.com/padmanabh_noob';

export const FollowUsModal: React.FC<FollowUsModalProps> = ({ onClose }) => {
  return (
    <div
      id="follow-us-modal"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Follow Us On</h2>
            <p className="text-[11px] text-zinc-400">Stay updated with NOOB's official pages</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <a
            href={INSTAGRAM_URL}
            target="_blank" data-no-inapp
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl bg-gradient-to-r from-fuchsia-600/20 via-pink-600/20 to-amber-500/20 border border-pink-500/30 hover:border-pink-400/60 transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-white block">Instagram</span>
              <span className="text-[11px] text-zinc-400 block truncate">@noobsocials</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-pink-400 transition-colors shrink-0" />
          </a>

          <a
            href={YOUTUBE_URL}
            target="_blank" data-no-inapp
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl bg-red-600/10 border border-red-500/30 hover:border-red-400/60 transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Youtube className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-white block">YouTube</span>
              <span className="text-[11px] text-zinc-400 block truncate">@noobsocials_456</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-red-400 transition-colors shrink-0" />
          </a>
          <a
            href={FOUNDER_URL}
            target="_blank" data-no-inapp
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl bg-white/5 border border-white/15 hover:border-white/35 transition-all group"
          >
            <div className="w-11 h-11 rounded-2xl bg-zinc-800 border border-white/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Instagram className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-white block">Founder on Instagram</span>
              <span className="text-[11px] text-zinc-400 block truncate">@padmanabh_noob</span>
            </div>
            <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
};
