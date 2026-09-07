import React from 'react';
import { X, User as UserIcon } from 'lucide-react';
import { VerifiedBadge } from './VerifiedBadge';

interface FullscreenAvatarModalProps {
  isOpen: boolean;
  avatarUrl?: string;
  username?: string;
  displayName?: string;
  isVerified?: boolean;
  onClose: () => void;
}

export const FullscreenAvatarModal: React.FC<FullscreenAvatarModalProps> = ({
  isOpen,
  avatarUrl,
  username,
  displayName,
  isVerified,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-sm sm:max-w-md w-full flex flex-col items-center p-6 bg-zinc-950/80 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 rounded-full border border-white/5 transition-colors cursor-pointer"
          title="Close full-screen profile picture"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Oversized Profile Image Overlay */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 my-4 rounded-full overflow-hidden p-1 bg-gradient-to-tr from-rose-500 via-purple-500 to-cyan-400 shadow-[0_0_50px_rgba(255,78,106,0.3)]">
          <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={username || 'Profile'}
                className="w-full h-full object-cover select-none"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <UserIcon className="w-24 h-24" />
              </div>
            )}
          </div>
        </div>

        {/* User Info & Badges */}
        <div className="text-center mt-2 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <h3 className="text-lg font-bold text-white tracking-tight">
              {displayName || username || 'NOOB Member'}
            </h3>
            {isVerified && <VerifiedBadge size="md" />}
          </div>
          {username && (
            <p className="text-xs font-mono text-zinc-400">@{username}</p>
          )}
        </div>
      </div>
    </div>
  );
};
