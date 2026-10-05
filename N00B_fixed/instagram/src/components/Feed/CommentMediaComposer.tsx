import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Mic, Smile, Sticker as StickerIcon, Square, X, RefreshCw, Volume2 } from 'lucide-react';
import { EmojiPanel } from '../Chat/EmojiPanel';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';
import { uploadMediaFile, type GifItem } from '../../services/api';

export interface CommentAttachment {
  type: 'image' | 'video' | 'voice' | 'gif' | 'sticker';
  url: string;
  objectKey?: string;
  duration?: string;
}

// Same small built-in set chat's GifPanel ships with — picked for a mood that fits reacting to a
// post/reel, not just chat.
const CURATED_GIFS: GifItem[] = [
  { id: 'g1', title: 'Victory Dance', url: 'https://i.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: 'g2', title: 'GG Game Over', url: 'https://i.giphy.com/media/l41JGlWa1xOjJSsV2/giphy.gif' },
  { id: 'g3', title: 'Mind Blown', url: 'https://i.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: 'g4', title: 'High Five', url: 'https://i.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif' },
  { id: 'g8', title: 'Big Laugh', url: 'https://i.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
  { id: 'g10', title: 'Congratulations', url: 'https://i.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif' },
  { id: 'g13', title: 'Whoo-Hoo!', url: 'https://i.giphy.com/media/xT5LMHxhOfscxPfIfm/giphy.gif' },
  { id: 'g14', title: 'Brilliant!', url: 'https://i.giphy.com/media/26BRBKqUiq586bRVm/giphy.gif' }
];

interface ComposerProps {
  onAttachmentChange: (a: CommentAttachment | null) => void;
  onInsertEmoji: (emoji: string) => void;
  disabled?: boolean;
}

// The attach bar that sits next to a comment's text input: photo/video, voice note, emoji, sticker,
// GIF — picking any of the first two uploads right away and hands back an attachment the composer
// holds until Send is actually pressed, same "attach now, send later" shape plain text already has.
export const CommentMediaComposer: React.FC<ComposerProps> = ({ onAttachmentChange, onInsertEmoji, disabled }) => {
  const [panel, setPanel] = useState<'emoji' | 'sticker' | 'gif' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const showError = (msg: string) => {
    setError(msg);
    window.setTimeout(() => setError((c) => (c === msg ? '' : c)), 6000);
  };

  const handleFilePicked = async (file: File) => {
    setPanel(null);
    setIsUploading(true);
    try {
      const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
      const uploaded = await uploadMediaFile(file, 'comments');
      onAttachmentChange({ type, url: uploaded.url, objectKey: uploaded.objectKey });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not attach that file.');
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    setPanel(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      showError('Microphone access was blocked. Please allow it in your browser settings to record a voice note.');
    }
  };

  const stopRecording = (shouldKeep: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !isRecording) return;
    const durationSeconds = recordingSeconds;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (!shouldKeep || durationSeconds < 1) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const ext = (recorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
      const mm = Math.floor(durationSeconds / 60);
      const ss = String(durationSeconds % 60).padStart(2, '0');
      setIsUploading(true);
      try {
        const uploaded = await uploadMediaFile(file, 'comments');
        onAttachmentChange({ type: 'voice', url: uploaded.url, objectKey: uploaded.objectKey, duration: `${mm}:${ss}` });
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Could not attach that voice note.');
      } finally {
        setIsUploading(false);
      }
    };
    recorder.stop();
  };

  if (isRecording) {
    return (
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => stopRecording(false)} className="text-[11px] font-bold text-gray-400 hover:text-white cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#00FF66] text-black text-[11px] font-bold cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFilePicked(f);
          e.target.value = '';
        }}
      />
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
          title="Photo or video"
          className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={startRecording}
          title="Voice note"
          className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
        >
          <Mic className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanel((p) => (p === 'emoji' ? null : 'emoji'))}
          title="Emoji"
          className={`p-1.5 rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer ${panel === 'emoji' ? 'text-[#00FF66]' : 'text-gray-400 hover:text-white'}`}
        >
          <Smile className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanel((p) => (p === 'sticker' ? null : 'sticker'))}
          title="Sticker"
          className={`p-1.5 rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer ${panel === 'sticker' ? 'text-[#00FF66]' : 'text-gray-400 hover:text-white'}`}
        >
          <StickerIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanel((p) => (p === 'gif' ? null : 'gif'))}
          title="GIF"
          className={`px-1.5 py-1 rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer text-[10px] font-black ${panel === 'gif' ? 'text-[#00FF66]' : 'text-gray-400 hover:text-white'}`}
        >
          GIF
        </button>
        {isUploading && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
      </div>

      {error && <p className="text-[10px] text-red-400 mt-1 px-1">{error}</p>}

      {panel && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto bg-[#0e0e0e] border border-neutral-800 rounded-2xl p-2.5 shadow-2xl z-10">
          {panel === 'emoji' && <EmojiPanel onPick={(e) => onInsertEmoji(e)} />}
          {panel === 'sticker' && (
            <AnimatedStickerPanel
              onPick={(url) => {
                onAttachmentChange({ type: 'sticker', url });
                setPanel(null);
              }}
            />
          )}
          {panel === 'gif' && (
            <GifPanel
              curated={CURATED_GIFS}
              onPick={(url) => {
                onAttachmentChange({ type: 'gif', url });
                setPanel(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

// The small chip shown above the input once something is attached, before the comment is actually sent.
export const CommentAttachmentPreview: React.FC<{ attachment: CommentAttachment; onRemove: () => void }> = ({ attachment, onRemove }) => (
  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-black rounded-xl border border-neutral-700">
    {attachment.type === 'image' && <img src={attachment.url} alt="" className="w-9 h-9 rounded-lg object-cover" />}
    {attachment.type === 'video' && <video src={attachment.url} className="w-9 h-9 rounded-lg object-cover" muted />}
    {attachment.type === 'gif' && <img src={attachment.url} alt="" className="w-9 h-9 rounded-lg object-cover" />}
    {attachment.type === 'sticker' && <img src={attachment.url} alt="" className="w-9 h-9 object-contain" />}
    {attachment.type === 'voice' && (
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#00FF66]">
        <Volume2 className="w-4 h-4" /> Voice note {attachment.duration ? `(${attachment.duration})` : ''}
      </span>
    )}
    <span className="flex-1 text-[10px] text-gray-400 capitalize">{attachment.type !== 'voice' && attachment.type}</span>
    <button type="button" onClick={onRemove} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-neutral-800 cursor-pointer">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

// Renders a sent comment's attachment (post/reel comment lists, both surfaces).
export const CommentMediaView: React.FC<{ url: string; type: string; duration?: string }> = ({ url, type, duration }) => {
  if (type === 'image') return <img src={url} alt="" className="mt-1.5 max-w-[200px] max-h-[200px] rounded-xl object-cover border border-neutral-800" />;
  if (type === 'video') return <video src={url} controls className="mt-1.5 max-w-[220px] max-h-[220px] rounded-xl border border-neutral-800" />;
  if (type === 'gif') return <img src={url} alt="GIF" className="mt-1.5 max-w-[180px] rounded-xl border border-neutral-800" />;
  if (type === 'sticker') return <img src={url} alt="Sticker" className="mt-1.5 w-20 h-20 object-contain" />;
  if (type === 'voice')
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <audio src={url} controls className="h-8 max-w-[220px]" />
        {duration && <span className="text-[10px] text-gray-500">{duration}</span>}
      </div>
    );
  return null;
};
