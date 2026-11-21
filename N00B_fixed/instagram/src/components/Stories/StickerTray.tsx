import React, { useRef, useState } from 'react';
import { Scissors, SlidersHorizontal, Loader2, MapPin, AtSign, Music2, Search, PlusSquare, Image as ImageIcon, Camera, LayoutPanelTop, HelpCircle, ListChecks, Link2, Hash, Timer, Smile, UserRound, Thermometer, Clock, ImagePlus, Star, Bell } from 'lucide-react';
import { EmojiPanel } from '../Chat/EmojiPanel';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';
import { uploadMediaFile } from '../../services/api';
import { personCutoutSticker } from './personCutout';
import { photoSticker, polaroidSticker, photostripSticker, timeSticker, temperatureSticker, pillSticker, cutoutSticker, currentTemperature, type CutoutShape } from './stickerMaker';
import { showErrorDialog } from '../../utils/errorDialog';
import { useSheetDrag } from '../../utils/sheetDrag';
import { SheetGrip } from '../Common/SheetGrip';
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
  /** an emoji slider (a question and an emoji the viewers slide) */
  onSlider: (question: string, emoji: string) => void;
  /** the story is added to this highlight when it is posted (id empty = a new highlight with this name) */
  onHighlight: (id: string, title: string) => void;
  /** your own highlights, to pick from */
  highlightChoices: Array<{ id: string; title: string }>;
  /** a "Notify me" button: viewers tap it and are told at this time */
  onNotify: (title: string, whenIso: string) => void;
}
type Pill = { key: string; label: string; Icon: React.ElementType; tint: string; run: () => void };

export const StickerTray: React.FC<Props> = (p) => {
  const drag = useSheetDrag(p.onClose);   // drag the grey bar down to close
  const [view, setView] = useState<'home' | 'emoji' | 'animated' | 'gif' | 'cutouts' | 'slider' | 'highlight' | 'notify'>('home');
  const [hlName, setHlName] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyWhen, setNotifyWhen] = useState(() => { const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0); const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; });
  const [shape, setShape] = useState<CutoutShape | 'person'>('circle');
  const [sliderQ, setSliderQ] = useState('How much do you like it?');
  const [sliderEmoji, setSliderEmoji] = useState('😍');
  const cutRef = useRef<HTMLInputElement | null>(null);
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
    { key: 'cutouts', label: 'Cutouts', Icon: Scissors, tint: 'text-green-500', run: () => setView('cutouts') },
    { key: 'highlight', label: 'Highlight', Icon: Star, tint: 'text-amber-500', run: () => setView('highlight') },
    { key: 'notify', label: 'Notify', Icon: Bell, tint: 'text-red-500', run: () => setView('notify') },
    { key: 'slider', label: 'Slider', Icon: SlidersHorizontal, tint: 'text-rose-500', run: () => setView('slider') },
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
      <div ref={drag.backdropRef} className="absolute inset-0 bg-black/40" onClick={p.onClose} aria-hidden="true" />
      <div ref={drag.sheetRef} className="relative h-[84%] rounded-t-[28px] bg-zinc-900/95 backdrop-blur-xl flex flex-col overflow-hidden">
        <SheetGrip drag={drag} alwaysBar barClassName="bg-white/40"><div className="h-1" aria-hidden="true" /></SheetGrip>
        {view !== 'home' && <button type="button" onClick={() => setView('home')} className="mx-4 mb-2 self-start text-sm font-bold text-white/80 cursor-pointer">← Back to stickers</button>}
        <label className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-white/12 px-4 h-11 text-white/70">
          <Search className="w-5 h-5" />
          <input value={q} onChange={(e) => { setQ(e.target.value); if (view !== 'home') setView('home'); }} placeholder="Search" aria-label="Search stickers" className="flex-1 bg-transparent text-base text-white placeholder-white/50 outline-none" />
        </label>

        <div className="flex-1 overflow-y-auto px-3 pb-6">
          {view === 'emoji' && <EmojiPanel onPick={p.onEmoji} />}
          {view === 'animated' && <AnimatedStickerPanel onPick={p.onImage} />}
          {view === 'gif' && <GifPanel curated={[]} onPick={p.onImage} />}
          {view === 'cutouts' && (
            <div className="px-2 pt-2" data-testid="sticker-cutouts">
              <h3 className="text-xl font-extrabold text-white mb-1">Cutouts</h3>
              <p className="text-white/60 text-sm mb-4">Pick a shape, then a picture. The picture is cut into that shape with a white edge. "Person" removes the background and keeps only the person.</p>
              <div className="grid grid-cols-5 gap-2 mb-5">
                {([['person', 'Person'], ['circle', 'Circle'], ['heart', 'Heart'], ['star', 'Star'], ['square', 'Rounded']] as Array<[CutoutShape | 'person', string]>).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setShape(k)} aria-pressed={shape === k} className={`h-20 rounded-2xl text-[13px] font-bold cursor-pointer ${shape === k ? 'bg-white text-black' : 'bg-white/12 text-white'}`}>{label}</button>
                ))}
              </div>
              <button type="button" onClick={() => cutRef.current?.click()} className="w-full h-12 rounded-2xl bg-white text-black text-base font-extrabold cursor-pointer">Choose a picture</button>
            </div>
          )}
          {view === 'highlight' && (
            <div className="px-2 pt-2" data-testid="sticker-highlight">
              <h3 className="text-xl font-extrabold text-white mb-1">Highlight</h3>
              <p className="text-white/60 text-sm mb-4">When you post this story, it is also added to the highlight you pick. It stays on your profile after the 24 hours.</p>
              {p.highlightChoices.length > 0 && (
                <div className="flex flex-col gap-2 mb-5">
                  {p.highlightChoices.map((h) => (
                    <button key={h.id} type="button" onClick={() => p.onHighlight(h.id, h.title)} className="h-12 rounded-2xl bg-white/12 text-white text-base font-bold px-4 text-left truncate cursor-pointer">{h.title}</button>
                  ))}
                </div>
              )}
              <p className="text-white/60 text-sm mb-2">Or start a new highlight</p>
              <input value={hlName} onChange={(e) => setHlName(e.target.value)} maxLength={30} placeholder="Name of the highlight" aria-label="Name of the new highlight" className="w-full h-12 rounded-2xl bg-white/12 px-4 text-base text-white outline-none mb-3" />
              <button type="button" disabled={!hlName.trim()} onClick={() => p.onHighlight('', hlName.trim())} className="w-full h-12 rounded-2xl bg-white text-black text-base font-extrabold cursor-pointer disabled:opacity-40">Add to a new highlight</button>
            </div>
          )}
          {view === 'notify' && (
            <div className="px-2 pt-2" data-testid="sticker-notify">
              <h3 className="text-xl font-extrabold text-white mb-1">Notify me</h3>
              <p className="text-white/60 text-sm mb-4">People who watch your story tap the button and get a notification at the time you choose.</p>
              <input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} maxLength={60} placeholder="What is it? (new video, live, sale...)" aria-label="What to remind about" className="w-full h-12 rounded-2xl bg-white/12 px-4 text-base text-white outline-none mb-3" />
              <input type="datetime-local" value={notifyWhen} onChange={(e) => setNotifyWhen(e.target.value)} aria-label="When" className="w-full h-12 rounded-2xl bg-white/12 px-4 text-base text-white outline-none mb-5" style={{ colorScheme: 'dark' }} />
              <button type="button" disabled={!notifyTitle.trim() || !notifyWhen} onClick={() => { const t = new Date(notifyWhen); if (isNaN(t.getTime()) || t.getTime() <= Date.now()) { showErrorDialog('Pick a time that has not passed yet.'); return; } p.onNotify(notifyTitle.trim(), t.toISOString()); }} className="w-full h-12 rounded-2xl bg-white text-black text-base font-extrabold cursor-pointer disabled:opacity-40">Add the Notify me button</button>
            </div>
          )}
          {view === 'slider' && (
            <div className="px-2 pt-2" data-testid="sticker-slider">
              <h3 className="text-xl font-extrabold text-white mb-1">Emoji slider</h3>
              <p className="text-white/60 text-sm mb-4">People who watch your story slide the emoji to answer.</p>
              <input value={sliderQ} onChange={(e) => setSliderQ(e.target.value)} maxLength={60} aria-label="Question" className="w-full h-12 rounded-2xl bg-white/12 px-4 text-base text-white outline-none mb-4" />
              <div className="flex gap-3 mb-5">
                {['😍', '🔥', '😂', '😮', '👍', '💯'].map((e) => (
                  <button key={e} type="button" onClick={() => setSliderEmoji(e)} aria-pressed={sliderEmoji === e} className={`w-12 h-12 rounded-full text-2xl cursor-pointer ${sliderEmoji === e ? 'bg-white' : 'bg-white/12'}`}>{e}</button>
                ))}
              </div>
              <button type="button" onClick={() => p.onSlider(sliderQ.trim() || 'How much do you like it?', sliderEmoji)} className="w-full h-12 rounded-2xl bg-white text-black text-base font-extrabold cursor-pointer">Add the slider</button>
            </div>
          )}
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
        <input ref={cutRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void place(() => (shape === 'person' ? personCutoutSticker(f) : cutoutSticker(f, shape)), 'cutout'); }} />
        <input ref={ownRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void place(async () => f, 'sticker'); }} />
      </div>
    </div>
  );
};
