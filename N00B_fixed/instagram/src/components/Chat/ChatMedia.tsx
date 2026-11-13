import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { chatMediaKeyOf, fetchChatMediaBlob, releaseChatMediaUrl } from '../../services/authedMedia';

// A plain (not locked) picture, video or voice note of a chat. These files are private to the chat: the website only hands them to a member who sends their sign-in
// token, which an ordinary <img src> can not do, so the file is downloaded with the token and shown from a memory address that is released when it leaves the screen
// (services/authedMedia.ts). Anything that is not a chat file (a GIF link, a sticker, an old outside address) is shown exactly as before.
export function ChatMedia({ src, kind, className, alt, style, controls = true }: { src: string; kind: 'image' | 'video' | 'audio'; className?: string; alt?: string; controls?: boolean; style?: CSSProperties }) {
  const key = chatMediaKeyOf(src);
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key) return;
    const abort = new AbortController();
    let made = '';
    setState('loading');
    fetchChatMediaBlob(key, { signal: abort.signal }).then((u) => {
      if (abort.signal.aborted) { releaseChatMediaUrl(u); return; }
      made = u;
      setUrl(u);
      setState('ready');
    }).catch(() => { if (!abort.signal.aborted) setState('failed'); });
    return () => { abort.abort(); releaseChatMediaUrl(made); setUrl(''); };
  }, [key, attempt]);

  if (!key) {
    if (kind === 'video') return <video src={src} controls={controls} className={className} />;
    if (kind === 'audio') return <audio src={src} controls={controls} className={className} style={style} />;
    return <img src={src} alt={alt || ''} className={className} referrerPolicy="no-referrer" loading="lazy" decoding="async" />;
  }
  if (state === 'ready' && url) {
    if (kind === 'video') return <video src={url} controls={controls} playsInline className={className} data-testid="chat-media-video" />;
    if (kind === 'audio') return <audio src={url} controls={controls} className={className} style={style} data-testid="chat-media-audio" />;
    return <img src={url} alt={alt || ''} className={className} decoding="async" data-testid="chat-media-image" />;
  }
  if (state === 'failed') {
    return (
      <button type="button" data-testid="chat-media-failed" onClick={() => setAttempt((n) => n + 1)} className="flex w-full items-center justify-center gap-2 px-4 py-5 text-xs text-zinc-300 cursor-pointer hover:bg-black/40">
        <span className="truncate">Could not open this. <span className="font-bold text-noob">Tap to try again</span></span>
      </button>
    );
  }
  return (
    <div className="flex w-full items-center justify-center gap-2 px-4 py-5 text-xs font-semibold text-zinc-300" role="status" data-testid="chat-media-loading">
      <span className="truncate">Loading...</span>
    </div>
  );
}
