import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Image as ImageIcon, Film, Smile, Paperclip } from 'lucide-react';
import { NoobRoomChatMessage, User } from '../../types';
import { sendNoobRoomChat, fetchNoobRoomChat, subscribeToNoobRoomChat, uploadMediaFile } from '../../services/api';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';

interface NoobRoomChatPanelProps {
  roomId: string;
  currentUser: User;
  onClose: () => void;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// In-room text chat with stickers/GIFs/photo/video — the picker panels (AnimatedStickerPanel,
// GifPanel) are reused exactly as the main Chat feature uses them, just wired to send into this
// room's chat instead of a DM/group conversation.
export const NoobRoomChatPanel: React.FC<NoobRoomChatPanelProps> = ({ roomId, currentUser, onClose }) => {
  const [messages, setMessages] = useState<NoobRoomChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<'none' | 'stickers' | 'gifs'>('none');
  const endRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchNoobRoomChat(roomId).then((res) => { if (alive && res.success) setMessages(res.messages); });
    const unsub = subscribeToNoobRoomChat(roomId, (m) => {
      setMessages((prev) => (prev.some((existing) => existing.id === m.id) ? prev : [...prev, m]));
    });
    return () => { alive = false; unsub(); };
  }, [roomId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const showError = (text: string) => {
    setError(text);
    window.setTimeout(() => setError((c) => (c === text ? '' : c)), 5000);
  };

  const handleSendText = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const res = await sendNoobRoomChat(roomId, text);
    setSending(false);
    if (!res.success) { showError(res.error || 'Could not send that message.'); return; }
    if (res.message) setMessages((prev) => (prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]));
  };

  const handleSendMedia = async (mediaUrl: string, mediaType: 'gif' | 'sticker' | 'image' | 'video') => {
    setPicker('none');
    const res = await sendNoobRoomChat(roomId, '', mediaUrl, mediaType);
    if (!res.success) { showError(res.error || 'Could not send that.'); return; }
    if (res.message) setMessages((prev) => (prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]));
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'video') => {
    const file = e.target.files?.[0];
    const ref = mediaType === 'video' ? videoInputRef : photoInputRef;
    if (ref.current) ref.current.value = '';
    if (!file) return;
    const maxBytes = mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      showError(`That ${mediaType} is too large — please keep it under ${mediaType === 'video' ? '50MB' : '15MB'}.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(file, 'chat');
      await handleSendMedia(uploaded.objectKey || uploaded.url, mediaType);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not send that attachment.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 h-2/3 bg-zinc-950 border-t border-zinc-800/80 rounded-t-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 shrink-0">
        <span className="text-white text-xs font-bold">Room chat</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2">
        {messages.map((m) => {
          const isSelf = m.sender.id === currentUser.id;
          return (
            <div key={m.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isSelf && <span className="text-[10px] text-zinc-500 font-semibold px-1">{m.sender.username}</span>}
                {m.mediaType === 'image' ? (
                  <img src={m.mediaUrl || ''} alt="" className="max-w-[180px] rounded-xl border border-zinc-800" />
                ) : m.mediaType === 'video' ? (
                  <video src={m.mediaUrl || ''} controls className="max-w-[200px] rounded-xl border border-zinc-800" />
                ) : m.mediaType === 'gif' || m.mediaType === 'sticker' ? (
                  <img src={m.mediaUrl || ''} alt="" className="max-w-[140px] rounded-xl" />
                ) : (
                  <div className={`px-3 py-1.5 rounded-2xl text-xs ${isSelf ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-white'}`}>
                    {m.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="shrink-0 mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{error}</div>
      )}

      {picker !== 'none' && (
        <div className="shrink-0 border-t border-zinc-800/80 max-h-64 overflow-y-auto px-3 py-2.5">
          {picker === 'stickers' && <AnimatedStickerPanel onPick={(url) => void handleSendMedia(url, 'sticker')} />}
          {picker === 'gifs' && <GifPanel curated={[]} onPick={(url) => void handleSendMedia(url, 'gif')} />}
        </div>
      )}

      <div className="shrink-0 flex items-center gap-1.5 p-2.5 border-t border-zinc-800/80">
        <input ref={photoInputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void handleAttachFile(e, 'image')} />
        <input ref={videoInputRef} type="file" accept="video/*" className="sr-only" onChange={(e) => void handleAttachFile(e, 'video')} />
        <button
          onClick={() => setPicker(picker === 'stickers' ? 'none' : 'stickers')}
          className={`shrink-0 p-2 rounded-full cursor-pointer ${picker === 'stickers' ? 'bg-[#00FF66]/20 text-[#00FF66]' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          title="Stickers"
        >
          <Smile className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={() => setPicker(picker === 'gifs' ? 'none' : 'gifs')}
          className={`shrink-0 p-2 rounded-full cursor-pointer text-[10px] font-black ${picker === 'gifs' ? 'bg-[#00FF66]/20 text-[#00FF66]' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
          title="GIFs"
        >
          GIF
        </button>
        <button onClick={() => photoInputRef.current?.click()} disabled={uploading} className="shrink-0 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer disabled:opacity-40" title="Photo">
          <ImageIcon className="w-4.5 h-4.5" />
        </button>
        <button onClick={() => videoInputRef.current?.click()} disabled={uploading} className="shrink-0 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer disabled:opacity-40" title="Video">
          <Film className="w-4.5 h-4.5" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSendText(); }}
          maxLength={300}
          placeholder={uploading ? 'Uploading…' : 'Message'}
          disabled={uploading}
          className="flex-1 min-w-0 bg-zinc-900 text-white placeholder-zinc-500 rounded-full px-3.5 py-2 text-xs outline-none disabled:opacity-60"
        />
        <button onClick={handleSendText} disabled={sending || !input.trim()} className="shrink-0 p-2 text-[#00FF66] disabled:opacity-40 disabled:text-zinc-500 cursor-pointer">
          {uploading ? <Paperclip className="w-4.5 h-4.5 animate-pulse" /> : <Send className="w-4.5 h-4.5" />}
        </button>
      </div>
    </div>
  );
};
