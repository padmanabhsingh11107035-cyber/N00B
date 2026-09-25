import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, Share2, Copy, Check } from 'lucide-react';
import { User } from '../../types';

interface ProfileQrModalProps {
  targetUser: User;
  onClose: () => void;
}

// Scanning this with ANY phone's camera or QR app opens this exact profile — even for someone who
// doesn't have NOOB yet: the URL App.tsx already reads (?profile=username, see handleShareProfile)
// works for a logged-out visitor too, once they sign up it lands them straight on this profile.
export const ProfileQrModal: React.FC<ProfileQrModalProps> = ({ targetUser, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(targetUser.username)}`;

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(shareUrl, { width: 480, margin: 2, color: { dark: '#000000ff', light: '#ffffffff' } })
      .then((url) => { if (alive) setQrDataUrl(url); })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — nothing more to do here
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${targetUser.username} on NOOB`, url: shareUrl });
      } catch {
        // the person cancelled the native share sheet — not an error
      }
    } else {
      handleCopyLink();
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `noob-${targetUser.username}-qr.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xs bg-zinc-950 border border-[#00FF66]/30 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">My QR Code</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          <div className="w-full aspect-square rounded-2xl bg-white p-3 flex items-center justify-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR code for @${targetUser.username}`} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full animate-pulse bg-zinc-200 rounded-xl" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <img
              src={targetUser.avatar || '/noob-logo.svg.jpeg'}
              alt={targetUser.username}
              className="w-8 h-8 rounded-full object-cover border border-zinc-700"
              referrerPolicy="no-referrer"
            />
            <span className="text-sm font-bold text-white" translate="no">@{targetUser.username}</span>
          </div>

          <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
            Scan this with any camera or QR app — Instagram, WhatsApp, or a phone's own camera — to open this profile on NOOB.
          </p>

          <div className="w-full grid grid-cols-3 gap-2">
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-[#00FF66]/50 text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              <Share2 className="w-4 h-4 text-[#00FF66]" />
              <span className="text-[10px] font-bold">Share</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-[#00FF66]/50 text-zinc-300 hover:text-white cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-[#00FF66]" /> : <Copy className="w-4 h-4 text-[#00FF66]" />}
              <span className="text-[10px] font-bold">{copied ? 'Copied' : 'Copy Link'}</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-[#00FF66]/50 text-zinc-300 hover:text-white cursor-pointer transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[#00FF66]" />
              <span className="text-[10px] font-bold">Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
