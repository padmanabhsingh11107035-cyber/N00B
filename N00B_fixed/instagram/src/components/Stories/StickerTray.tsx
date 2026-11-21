import React, { useRef, useState } from 'react';
import { Loader2, MapPin, AtSign, Music2, Search, PlusSquare, Image as ImageIcon, Camera, LayoutPanelTop, HelpCircle, ListChecks, Link2, Hash, Timer, Smile, UserRound, Thermometer, Clock, ImagePlus } from 'lucide-react';
import { EmojiPanel } from '../Chat/EmojiPanel';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';
import { uploadMediaFile } from '../../services/api';
import { photoSticker, polaroidSticker, photostripSticker, timeSticker, temperatureSticker, pillSticker, currentTemperature } from './stickerMaker';
import { showErrorDialog } from '../../utils/errorDialog';
import './storyCamera.css';

// The sticker tray of the story editor, drawn like Instagram's: a search box, a cloud of white pills (Location, mention, Music, GIF, Add yours, Frames, Photostrip, Photo, Questions, Poll, Link, hashtag,
// Countdown ...), the emoji and your own stickers, and the time and the temperature. Each pill does one real thing; the ones that need a page of their own hand over to the editor.
interface Props {
  avatar?: string;
  onClose: () => void;
  onEmoji: (emoji: string) => void;
  onImage: (url: string) => void;
  onLocation: () => void;
  onMention: () => void;
  onMusic: () => void;
  onPoll: () => void;
  onQuestions: () => void;
  onLink: () => void;
  onHashtag: () => void;
  onCountdown: () => void;
}
type Pill = { key: string; label: string; Icon: React.ElementType; tint: string; run: () => void };

export const StickerTray: React.FC<Props> = (p) => {
  const [view, setView] = useState<'home' | 'emoji' | 'animated' | 'gif'>('home');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const photoRef = useRef<HTMLInputElement | null>(null);
  const frameRef = useRef<HTMLInputElement | null>(null);
  const stripRef = useRef<HTMLInputElement | null>(null);
  const ownRef = useRef<HTMLInputElement | null>(null);

  const place = async (make: () => Promise<File>, label: string) => {
    setBusy(label);
    try {
      const file = await make();
      const res = await uploadMediaFile(file, 'stickers');
      if (res.url) p.onImage(res.url); else showErrorDialog('The sticker could not be added. Please try again.');
    } catch (e) { showErrorDialog(e instanceof Error ? e.message : 'The sticker could not be added. Please try again.'); }
    finally { setBusy(''); }
  };
  const pickOne = (ref: React.RefObject<HTMLInputElement | null>, make: (f: File) => Promise<File>, label: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) void place(() => make(f), label);
  };

  const pills: Pill[] = [
    { key: 'location', label: 'Location', Icon: MapPin, tint: 'text-violet-500', run: p.onLocation },
    { key: 'mention', label: 'Mention', Icon: AtSign, tint: 'text-orange-500', run: p.onMention },
    { key: 'music', label: 'Music', Icon: Music2, tint: 'text-pink-500', run: p.onMusic },
    { key: 'gif', label: 'GIF', Icon: Search, tint: 'text-green-500', run: () => setView('gif') },
    { key: 'addyours', label: 'Add yours', Icon: PlusSquare, tint: 'text-fuchsia-500', run: () => void place(() => pillSticker('Add yours', '#d946ef'), 'Add yours') },
    { key: 'frames', label: 'Frames', Icon: Camera, tint: 'text-zinc-500', run: () => frameRef.current?.click() },
    { key: 'strip', label: 'Photostrip', Icon: LayoutPanelTop, tint: 'text-sky-500', run: () => stripRef.current?.click() },
    { key: 'photo', label: 'Photo', Icon: ImageIcon, tint: 'text-emerald-500', run: () => photoRef.current?.click() },
    { key: 'questions', label: 'Questions', Icon: HelpCircle, tint: 'text-pink-500', run: p.onQuestions },
    { key: 'avatar', label: 'Avatar', Icon: UserRound, tint: 'text-orange-500', run: () => { if (p.avatar) p.onImage(p.avatar); else showErrorDialog('You have no profile picture to use yet.'); } },
    { key: 'emoji', label: 'Emoji', Icon: Smile, tint: 'text-amber-500', run: () => setView('emoji') },
    { key: 'poll', label: 'Poll', Icon: ListChecks, tint: 'text-fuchsia-500', run: p.onPoll },
    { key: 'link', label: 'Link', Icon: Link2, tint: 'text-sky-500', run: p.onLink },
    { key: 'hashtag', label: 'hashtag', Icon: Hash, tint: 'text-fuchsia-500', run: p.onHashtag },
    { key: 'countdown', label: 'Countdown', Icon: Timer, tint: 'text-pink-500', run: p.onCountdown }
  ];
  const shown = pills.filter((x) => !q.trim() || x.label.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Stickers" data-testid="sticker-tray">
      <div className="absolute inset-0 bg-black/40" onClick={p.onClose} aria-hidden="true" />
      <div className="relative h-[84%] rounded-t-[28px] bg-zinc-900/95 backdrop-blur-xl flex flex-col overflow-hidden">
        <div className="flex justify-center pt-3 pb-2"><button type="button" onClick={view === 'home' ? p.onClose : () => setView('home')} aria-label={view === 'home' ? 'Close stickers' : 'Back to stickers'} className="w-10 h-1.5 rounded-full bg-white/40" /></div>
        <label className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-white/12 px-4 h-11 text-white/70">
          <Search className="w-5 h-5" />
          <input value={q} onChange={(e) => { setQ(e.target.value); if (view !== 'home') setView('home'); }} placeholder="Search" aria-label="Search stickers" className="flex-1 bg-transparent text-base text-white placeholder-white/50 outline-none" />
        </label>

        <div className="flex-1 overflow-y-auto px-3 pb-6">
          {view === 'emoji' && <EmojiPanel onPick={p.onEmoji} />}
          {view === 'animated' && <AnimatedStickerPanel onPick={p.onImage} />}
          {view === 'gif' && <GifPanel curated={[]} onPick={p.onImage} />}
          {view === 'home' && (
            <>
              <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-3 pt-1">
                {shown.map(({ key, label, Icon, tint, run }) => (
                  <button key={key} type="button" onClick={run} data-testid={`sticker-pill-${key}`} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 h-11 text-[17px] font-semibold text-black shadow active:scale-95 transition-transform cursor-pointer">
                    <Icon className={`w-5 h-5 ${tint}`} />{label}
                  </button>
                ))}
                {shown.length === 0 && <p className="text-white/60 text-sm py-6">Nothing matches. Try another word.</p>}
              </div>

              <h3 className="mt-7 mb-3 px-2 text-xl font-extrabold text-white">Your stickers</h3>
              <div className="flex items-center gap-3 px-2">
                <button type="button" onClick={() => ownRef.current?.click()} className="w-16 h-16 rounded-full border-2 border-white/40 text-white/80 flex items-center justify-center cursor-pointer" aria-label="Add your own sticker"><ImagePlus className="w-6 h-6" /></button>
                <button type="button" onClick={() => setView('animated')} className="px-4 h-11 rounded-2xl bg-white/12 text-white text-sm font-bold cursor-pointer">Animated stickers</button>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 px-2">
                <button type="button" onClick={() => void place(async () => temperatureSticker(await currentTemperature()), 'Temperature')} data-testid="sticker-temperature" className="h-24 rounded-2xl bg-white/10 text-white flex flex-col items-center justify-center gap-1 cursor-pointer"><Thermometer className="w-6 h-6" /><span className="text-sm font-bold">Temperature now</span></button>
                <button type="button" onClick={() => void place(() => timeSticker(), 'Time')} data-testid="sticker-time" className="h-24 rounded-2xl bg-white/10 text-white flex flex-col items-center justify-center gap-1 cursor-pointer"><Clock className="w-6 h-6" /><span className="text-sm font-bold">Time now</span></button>
              </div>
            </>
          )}
        </div>
        {busy && <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none"><span className="inline-flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white"><Loader2 className="w-4 h-4 animate-spin" />Adding {busy}…</span></div>}

        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickOne(photoRef, photoSticker, 'photo')} />
        <input ref={frameRef} type="file" accept="image/*" className="hidden" onChange={pickOne(frameRef, polaroidSticker, 'frame')} />
        <input ref={stripRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs: File[] = Array.from(e.target.files || []).slice(0, 4) as File[]; e.target.value = ''; if (fs.length) void place(() => photostripSticker(fs), 'photostrip'); }} />
        <input ref={ownRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void place(async () => f, 'sticker'); }} />
      </div>
    </div>
  );
};
