import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Check, Link2, Loader2, Send, Mail, MessageSquare, Instagram, Twitter, Facebook, Share, CheckCircle2 } from 'lucide-react';
import { User } from '../../types';
import { fetchChats, sendMessage } from '../../services/api';
import { copyText } from '../../utils/clipboard';
import { contentUrl } from '../../utils/routes';
import { AvatarMedia } from './AvatarMedia';
import { useSheetDrag } from '../../utils/sheetDrag';
import { useKeyboardMetrics } from '../../utils/useVisualViewport';
import { SheetGrip, CLOSE_X_CLASS } from './SheetGrip';
import { MAX_FRIENDS_AT_ONCE, appLink, filterFriends, friendsFromChats, shareText, toggleFriend, type Friend, type ShareApp } from '../../utils/shareTargets';

// The Share sheet of a post, reel or video, laid out like Instagram's: a search box, the people you talk to as a grid of faces (tap to pick up to five, then Send), and under them a row of
// the other apps (WhatsApp, Instagram, X, Facebook, Telegram, Messages, Email), Copy link and More (the phone's own share sheet).
// It is drawn straight on the page (a portal), not inside the page that opened it: the Reels page is a layer of its own, under the bottom bar, and the row of apps used to be
// hidden behind that bar there.
export interface SharePostSheetProps {
  type: 'post' | 'reel' | 'video';
  currentUser: User;
  itemId: string;
  /** who made it, for the text that goes with the link */
  ownerUsername?: string;
  onClose: () => void;
}

const TYPE_LABEL: Record<SharePostSheetProps['type'], string> = { post: 'Post', reel: 'Reel', video: 'Video' };

const WhatsAppGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 21l1.65-4.87A9 9 0 1 1 8.2 19.4L3 21z" />
    <path d="M9 10c.4 2.2 2.6 4.4 4.9 5l1.3-1.3a.8.8 0 0 1 .8-.2l2 .7c.4.1.6.5.5.9-.3 1.3-1.5 2.1-2.8 1.9-3.9-.6-7-3.6-7.6-7.5-.1-1.3.7-2.5 1.9-2.8.4-.1.8.1.9.5l.7 2c.1.3 0 .6-.2.8L9 10z" />
  </svg>
);

const APP_LOOK: Record<ShareApp, { bg: string; icon: React.ReactNode }> = {
  whatsapp: { bg: 'bg-[#25D366] text-white', icon: <WhatsAppGlyph className="w-6 h-6" /> },
  instagram: { bg: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white', icon: <Instagram className="w-6 h-6" /> },
  x: { bg: 'bg-black border border-zinc-600 text-white', icon: <Twitter className="w-5 h-5" /> },
  facebook: { bg: 'bg-[#1877F2] text-white', icon: <Facebook className="w-6 h-6" /> },
  telegram: { bg: 'bg-[#229ED9] text-white', icon: <Send className="w-5 h-5 -ml-0.5" /> },
  messages: { bg: 'bg-[#34C759] text-white', icon: <MessageSquare className="w-5 h-5" /> },
  email: { bg: 'bg-zinc-700 text-white', icon: <Mail className="w-5 h-5" /> }
};
const APP_ORDER: Array<{ id: ShareApp; label: string }> = [
  { id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }, { id: 'x', label: 'X' }, { id: 'facebook', label: 'Facebook' },
  { id: 'telegram', label: 'Telegram' }, { id: 'messages', label: 'Messages' }, { id: 'email', label: 'Email' }
];

export const SharePostSheet: React.FC<SharePostSheetProps> = ({ type, currentUser, itemId, ownerUsername, onClose }) => {
  const drag = useSheetDrag(onClose);   // drag the grey bar down to close
  const kbm = useKeyboardMetrics();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');

  const url = contentUrl(type === 'video' ? 'video' : type, itemId);
  const content = useMemo(() => ({ url, text: shareText(type, ownerUsername) }), [url, type, ownerUsername]);

  useEffect(() => {
    let alive = true;
    fetchChats().then((chats) => { if (alive) { setFriends(friendsFromChats(chats, currentUser.id)); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [currentUser.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => filterFriends(friends, query), [friends, query]);

  const send = async () => {
    if (picked.size === 0 || sending) return;
    setSending(true);
    const targets = friends.filter((f) => picked.has(f.chatId));
    const results = await Promise.all(targets.map((f) => sendMessage(f.chatId, { sharedPostId: itemId, sharedPostType: type }).then(() => f, () => null)));
    setSending(false);
    const ok = results.filter((f): f is Friend => !!f);
    if (ok.length === 0) { setNote('Could not send. Check your connection and try again.'); return; }
    setSentTo(ok.map((f) => f.user.displayName || f.user.username));
    window.setTimeout(onClose, 1400);
  };

  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    setNote(ok ? '' : 'Could not copy. Long-press the link to copy it.');
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async (): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { await navigator.share({ title: 'NOOB', text: content.text, url }); return true; }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return true;   // the person closed the phone's share sheet: nothing is wrong
    }
    return false;
  };

  const openApp = async (app: ShareApp) => {
    if (app === 'instagram') {
      // Instagram has no link for sharing from a website: on a phone its own share sheet lists Instagram; elsewhere the link is copied and Instagram's messages open
      if (await nativeShare()) return;
      const ok = await copyText(url);
      setNote(ok ? 'Link copied. Paste it in your Instagram message.' : 'Open your Instagram message and paste this link: ' + url);
      window.open('https://www.instagram.com/direct/new/', '_blank', 'noopener,noreferrer');
      return;
    }
    const link = appLink(app, content);
    if (!link) return;
    if (link.startsWith('sms:') || link.startsWith('mailto:')) window.location.href = link;
    else window.open(link, '_blank', 'noopener,noreferrer');
  };

  // On a phone the keyboard (the search box) lifts the sheet: it keeps its own colour all the way down behind the keyboard's glass, so the page never shows through it.
  const sheetStyle = kbm.phone ? { maxHeight: Math.max(220, Math.min(Math.round(kbm.page * 0.82), kbm.visible - 12)) + kbm.keyboard, paddingBottom: kbm.keyboard || undefined } : undefined;
  const sheet = (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" data-testid="share-sheet">
      <div ref={drag.backdropRef} className="absolute inset-0 bg-black/70 animate-in fade-in duration-150" onClick={onClose} aria-hidden="true" />
      <div
        ref={drag.sheetRef}
        style={sheetStyle}
        className="relative w-full sm:max-w-md max-h-[82dvh] bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        role="dialog"
        aria-label={`Share ${TYPE_LABEL[type]}`}
      >
        <SheetGrip drag={drag} className="pb-1" />

        <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
          <label className="flex-1 flex items-center gap-2 rounded-full bg-zinc-800 px-3.5 py-2.5">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search people" className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-400 outline-none" data-testid="share-search" />
          </label>
          <button onClick={onClose} aria-label="Close" className={`${CLOSE_X_CLASS} p-2.5 rounded-full bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer shrink-0`}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-[9rem] overflow-y-auto px-2 pb-2" data-testid="share-friends">
          {sentTo ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-noob mx-auto" />
              <p className="text-sm font-bold text-white" data-testid="share-sent">Sent{sentTo.length === 1 ? ` to ${sentTo[0]}` : ` to ${sentTo.length} people`}</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-4 gap-y-4 pt-3" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5"><span className="w-14 h-14 rounded-full bg-zinc-800 animate-pulse" /><span className="w-12 h-2.5 rounded bg-zinc-800 animate-pulse" /></div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500 px-6">{friends.length === 0 ? 'You have no chats yet. Message someone first, or share with one of the apps below.' : 'Nobody matches that name.'}</p>
          ) : (
            <div className="grid grid-cols-4 gap-y-3 pt-2">
              {shown.map((f) => {
                const on = picked.has(f.chatId);
                const full = !on && picked.size >= MAX_FRIENDS_AT_ONCE;
                return (
                  <button key={f.chatId} onClick={() => setPicked((p) => toggleFriend(p, f.chatId))} disabled={full} aria-pressed={on} className="flex flex-col items-center gap-1 px-1 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" data-testid="share-friend">
                    <span className="relative">
                      <AvatarMedia src={f.user.avatar} alt={f.user.username} className={`w-14 h-14 rounded-full object-cover ${on ? 'ring-2 ring-noob ring-offset-2 ring-offset-zinc-900' : ''}`} />
                      {on && <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-noob text-black flex items-center justify-center border-2 border-zinc-900"><Check className="w-3 h-3" /></span>}
                    </span>
                    <span className="text-[11px] text-zinc-200 max-w-full truncate leading-tight" translate="no">{f.user.displayName || f.user.username}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {note && <p className="px-4 pb-1 text-[11px] text-amber-300 shrink-0" role="status">{note}</p>}

        <div className="border-t border-zinc-800 shrink-0 pb-[env(safe-area-inset-bottom)]">
          {picked.size > 0 && !sentTo ? (
            <div className="p-3">
              <button onClick={send} disabled={sending} className="w-full py-3 rounded-2xl bg-noob text-black text-sm font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60" data-testid="share-send">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : picked.size === 1 ? 'Send' : `Send to ${picked.size} people`}
              </button>
            </div>
          ) : (
            <div className="flex gap-3.5 overflow-x-auto no-scrollbar px-4 pt-3 pb-6" data-testid="share-apps">
              {APP_ORDER.slice(0, 1).map((a) => (
                <ShareIcon key={a.id} label={a.label} look={APP_LOOK[a.id].bg} onClick={() => void openApp(a.id)} testId={`share-app-${a.id}`}>{APP_LOOK[a.id].icon}</ShareIcon>
              ))}
              <ShareIcon label={copied ? 'Copied!' : 'Copy link'} look="bg-zinc-700 text-white" onClick={() => void copy()} testId="share-copy">{copied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}</ShareIcon>
              {APP_ORDER.slice(1).map((a) => (
                <ShareIcon key={a.id} label={a.label} look={APP_LOOK[a.id].bg} onClick={() => void openApp(a.id)} testId={`share-app-${a.id}`}>{APP_LOOK[a.id].icon}</ShareIcon>
              ))}
              <ShareIcon label="More" look="bg-zinc-700 text-white" onClick={() => void nativeShare().then((ok) => { if (!ok) void copy(); })} testId="share-more"><Share className="w-5 h-5" /></ShareIcon>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
};

const ShareIcon: React.FC<{ label: string; look: string; onClick: () => void; testId: string; children: React.ReactNode }> = ({ label, look, onClick, testId, children }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1.5 w-[4.25rem] shrink-0 cursor-pointer" data-testid={testId}>
    <span className={`w-12 h-12 rounded-full flex items-center justify-center ${look}`}>{children}</span>
    <span className="text-[10.5px] text-zinc-300 leading-tight text-center">{label}</span>
  </button>
);
