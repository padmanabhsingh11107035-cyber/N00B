import React from 'react';
import { X, Copy, Check, MessageCircle, QrCode } from 'lucide-react';

interface ShareProfileSheetProps {
  username: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  onSendInChat: () => void;
  onShowQrCode: () => void;
  onClose: () => void;
}

export const ShareProfileSheet: React.FC<ShareProfileSheetProps> = ({
  username,
  linkCopied,
  onCopyLink,
  onSendInChat,
  onShowQrCode,
  onClose
}) => {
  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Share Profile</h2>
            <p className="text-[11px] text-zinc-400" translate="no">@{username}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-2 space-y-1">
          <button
            onClick={onSendInChat}
            className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Send in Chat</span>
              <span className="text-[10px] text-zinc-400">Pick up to 5 people to send it to</span>
            </div>
          </button>

          <button
            onClick={onShowQrCode}
            className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
              <QrCode className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">QR Code</span>
              <span className="text-[10px] text-zinc-400">Scannable from any app — Instagram, WhatsApp & more</span>
            </div>
          </button>

          <button
            onClick={onCopyLink}
            className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/30 flex items-center justify-center shrink-0">
              {linkCopied ? <Check className="w-4.5 h-4.5 text-[#00FF66]" /> : <Copy className="w-4.5 h-4.5 text-[#00FF66]" />}
            </div>
            <div>
              <span className="text-xs font-bold text-white block">{linkCopied ? 'Link Copied!' : 'Copy Link'}</span>
              <span className="text-[10px] text-zinc-400">Paste it anywhere</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
