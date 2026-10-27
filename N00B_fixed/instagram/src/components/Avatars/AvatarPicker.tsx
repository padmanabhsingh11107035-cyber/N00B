import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { AVATARS, avatarIdOf, avatarUrl, type Avatar } from '../../data/avatars';
import { mediaOrigin } from '../../utils/siteUrl';

// Choose an avatar. One full-screen page: swipe sideways through the characters (each on the colour of its own picture), the name and the role at the top, small pictures of all of
// them at the bottom, and an arrow that lifts a frosted-glass sheet over 70 % of the page (description, clothes, style traits, info). The sheet follows the finger exactly, can be left
// anywhere between closed, 70 % and full, and settles on the nearest of the three when let go (no bounce past the ends). "Use this avatar" saves it as the profile picture.

const SNAP_OPEN = 0.3;   // the sheet's top edge at 30 % of the page = it covers 70 %
const HEADER_H = 124;    // the grip, the name and the role: the part of the sheet that is dragged
const CTA_H = 84;        // the "Use this avatar" bar at the bottom of the sheet

interface Props {
  /** the picture the person has now (to mark it and to open on it) */
  current?: string | null;
  /** saves the choice; may take a moment */
  onChoose: (a: Avatar) => Promise<void> | void;
  onClose: () => void;
}

const shade = (hex: string, amt: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

export const AvatarPicker: React.FC<Props> = ({ current, onChoose, onClose }) => {
  const currentId = avatarIdOf(current);
  const start = Math.max(0, AVATARS.findIndex((a) => a.id === currentId));
  const [idx, setIdx] = useState(start);
  const idxRef = useRef(start);
  const [open, setOpen] = useState<'closed' | 'open' | 'full'>('closed');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement | null>(null);
  const pager = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const dim = useRef<HTMLDivElement | null>(null);
  const H = useRef(800);
  const y = useRef(800);
  const drag = useRef<{ startY: number; startPos: number; lastY: number; lastT: number; v: number } | null>(null);
  const origin = mediaOrigin();
  const av = AVATARS[idx];
  const text = av.light ? '#14161c' : '#ffffff';
  const soft = av.light ? 'rgba(20,22,28,.7)' : 'rgba(255,255,255,.78)';
  const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // where the sheet is: moves it, dims the page behind it and gives the scrolling part exactly the height that is on the screen
  const place = useCallback((to: number, animate: boolean) => {
    const el = sheet.current; if (!el) return;
    y.current = to;
    el.style.transition = animate && !calm ? 'transform .42s cubic-bezier(.22,.9,.24,1)' : 'none';
    el.style.transform = `translate3d(0, ${to}px, 0)`;
    if (dim.current) { dim.current.style.transition = el.style.transition.replace('transform', 'opacity'); dim.current.style.opacity = String(Math.max(0, Math.min(0.55, (1 - to / H.current) * 0.7))); dim.current.style.pointerEvents = to < H.current - 4 ? 'auto' : 'none'; }
    if (scroller.current) scroller.current.style.height = `${Math.max(0, H.current - to - HEADER_H - CTA_H)}px`;
  }, [calm]);

  useLayoutEffect(() => {
    const measure = () => {
      H.current = root.current?.clientHeight || window.innerHeight;
      const target = open === 'full' ? 0 : open === 'open' ? H.current * SNAP_OPEN : H.current;
      place(target, false);
      const el = pager.current; if (el) el.scrollLeft = idxRef.current * el.clientWidth;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (root.current) ro.observe(root.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapTo = useCallback((state: 'closed' | 'open' | 'full') => {
    setOpen(state);
    place(state === 'full' ? 0 : state === 'open' ? H.current * SNAP_OPEN : H.current, true);
  }, [place]);

  const goTo = useCallback((i: number) => {
    const el = pager.current; if (!el) return;
    const n = Math.max(0, Math.min(AVATARS.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: calm ? 'auto' : 'smooth' });
  }, [calm]);

  const onScroll = () => {
    const el = pager.current; if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== idxRef.current && i >= 0 && i < AVATARS.length) {
      idxRef.current = i; setIdx(i); setDone(''); setError('');
      try { navigator.vibrate?.(5); } catch { /* not everywhere */ }
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(idxRef.current + 1);
      else if (e.key === 'ArrowLeft') goTo(idxRef.current - 1);
      else if (e.key === 'ArrowUp') snapTo(open === 'closed' ? 'open' : 'full');
      else if (e.key === 'ArrowDown') snapTo(open === 'full' ? 'open' : 'closed');
      else if (e.key === 'Escape') { if (open !== 'closed') snapTo('closed'); else onClose(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [goTo, snapTo, open, onClose]);

  // the small thumbnail of the active one stays in view
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = strip.current, b = row?.children[idx] as HTMLElement | undefined;
    // (not scrollIntoView: it would also slide the whole page sideways)
    if (row && b) row.scrollTo({ left: b.offsetLeft - (row.clientWidth - b.clientWidth) / 2, behavior: calm ? 'auto' : 'smooth' });
  }, [idx, calm]);

  // ---- dragging the sheet (from its grip, name and role): it follows the finger exactly and never goes past full or closed
  const down = (e: React.PointerEvent) => {
    if (open === 'closed') return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, startPos: y.current, lastY: e.clientY, lastT: performance.now(), v: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const now = performance.now(), dt = Math.max(1, now - d.lastT);
    d.v = 0.8 * d.v + 0.2 * ((e.clientY - d.lastY) / dt);
    d.lastY = e.clientY; d.lastT = now;
    place(Math.max(0, Math.min(H.current, d.startPos + (e.clientY - d.startY))), false);
  };
  const up = () => {
    const d = drag.current; if (!d) return;
    drag.current = null;
    const pts: Array<['full' | 'open' | 'closed', number]> = [['full', 0], ['open', H.current * SNAP_OPEN], ['closed', H.current]];
    let pick = pts.reduce((best, p) => (Math.abs(p[1] - y.current) < Math.abs(best[1] - y.current) ? p : best), pts[0]);
    if (Math.abs(d.v) > 0.5) {   // a quick flick goes on to the next stop in its direction
      const i = pts.findIndex((p) => p[0] === pick[0]);
      const next = d.v < 0 ? Math.max(0, i - (y.current > pts[i][1] ? 0 : 1)) : Math.min(2, i + (y.current < pts[i][1] ? 0 : 1));
      pick = pts[d.v < -1.6 ? 0 : next];
    }
    snapTo(pick[0]);
  };

  const choose = async () => {
    if (busy) return;
    setBusy(true); setError(''); setDone('');
    try { await onChoose(av); setDone(`Your avatar is now ${av.name}.`); window.setTimeout(onClose, 900); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your avatar. Please try again.'); }
    finally { setBusy(false); }
  };

  const isCurrent = currentId === av.id;
  const glass = av.light ? 'rgba(255,255,255,.62)' : `color-mix(in srgb, ${shade(av.bg, -0.45)} 62%, rgba(255,255,255,.12))`;

  return (
    <div ref={root} className="fixed inset-0 z-[110] overflow-hidden select-none" style={{ background: `linear-gradient(180deg, ${shade(av.bg, 0.12)} 0%, ${av.bg} 45%, ${shade(av.bg, -0.35)} 100%)`, color: text, transition: calm ? 'none' : 'background .45s ease', fontFamily: 'var(--font-app)' }} role="dialog" aria-modal="true" aria-label="Choose an avatar" data-testid="avatar-picker" data-noob-keep="">
      <style>{`
        @keyframes av-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes av-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .av-pager::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) { .av-bob, .av-in { animation: none !important; } }
      `}</style>

      {/* the characters: swipe sideways */}
      <div ref={pager} onScroll={onScroll} className="av-pager absolute inset-0 flex overflow-x-auto overflow-y-hidden" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }} aria-roledescription="carousel">
        {AVATARS.map((a, i) => (
          <section key={a.id} className="relative shrink-0 w-full h-full overflow-hidden" style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }} aria-label={`${a.name}, ${a.role}`} aria-hidden={i !== idx}>
            {/* the name, huge and faint, behind the character */}
            <div aria-hidden="true" className="absolute inset-x-0 top-[17%] flex flex-col items-center leading-none font-black uppercase pointer-events-none" style={{ fontSize: 'min(30vw, 150px)', letterSpacing: '.04em', color: a.light ? 'rgba(20,22,28,.08)' : 'rgba(255,255,255,.09)', transform: `translateX(${(i - idx) * 18}px)`, transition: calm ? 'none' : 'transform .5s ease' }}>
              <span>{a.name}</span><span>{a.name}</span><span>{a.name}</span>
            </div>
            <div className="absolute left-1/2 top-[13%] bottom-[19%] flex items-start justify-center" style={{ width: 'min(150vw, 700px)', transform: `translateX(-50%) scale(${i === idx ? 1 : 0.92})`, opacity: i === idx ? 1 : 0.7, transition: calm ? 'none' : 'transform .45s ease, opacity .45s ease' }}>
              <img src={avatarUrl(a.id, '', origin)} alt={`${a.name}, ${a.role}`} draggable={false} loading={Math.abs(i - start) < 2 ? 'eager' : 'lazy'} decoding="async" className="h-full w-auto max-w-none object-contain"
                style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%), linear-gradient(to bottom, transparent 0, #000 5%, #000 97%, transparent 100%)', WebkitMaskComposite: 'source-in', maskImage: 'linear-gradient(to right, transparent 0, #000 14%, #000 86%, transparent 100%), linear-gradient(to bottom, transparent 0, #000 5%, #000 97%, transparent 100%)', maskComposite: 'intersect' }} />
            </div>
          </section>
        ))}
      </div>

      {/* the top: back, the name and the role of the one on the screen */}
      <button type="button" onClick={onClose} aria-label="Back" className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] w-10 h-10 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform z-20" style={{ background: av.light ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.22)', color: text }}><ChevronLeft className="w-6 h-6" /></button>
      <div key={av.id} className="av-in absolute inset-x-0 top-[max(1.1rem,env(safe-area-inset-top))] flex flex-col items-center pointer-events-none z-10" style={{ animation: calm ? 'none' : 'av-in .35s ease both' }} aria-live="polite">
        <h1 className="font-black uppercase" style={{ fontSize: 'clamp(30px, 9vw, 40px)', letterSpacing: '.22em', paddingLeft: '.22em', textShadow: av.light ? 'none' : '0 3px 14px rgba(0,0,0,.28)' }} data-testid="avatar-name">{av.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: soft }}><Sparkles className="w-3.5 h-3.5" aria-hidden="true" />{av.role}</p>
        <p className="mt-1 text-[11px]" style={{ color: soft }}>{idx + 1} / {AVATARS.length}</p>
      </div>

      {/* the bottom: the arrow, the button and the small pictures of everyone */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => snapTo('open')} aria-label={`More about ${av.name}`} aria-expanded={open !== 'closed'} data-testid="avatar-more" className="av-bob w-12 h-12 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform" style={{ animation: calm ? 'none' : 'av-bob 1.8s ease-in-out infinite', background: av.light ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.22)', backdropFilter: 'blur(10px)', color: text, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}><ChevronUp className="w-6 h-6" /></button>
        <button type="button" onClick={() => void choose()} disabled={busy || isCurrent} data-testid="avatar-use" className="h-11 px-8 rounded-full font-extrabold text-sm cursor-pointer disabled:opacity-80 active:scale-[0.98] transition-transform inline-flex items-center gap-2" style={{ background: av.light ? '#14161c' : '#ffffff', color: av.light ? '#ffffff' : '#14161c' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrent ? <Check className="w-4 h-4" /> : null}{busy ? 'Saving…' : isCurrent ? 'This is your avatar' : 'Use this avatar'}
        </button>
        {(done || error) && <p role={error ? 'alert' : 'status'} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: error ? 'rgba(220,38,38,.9)' : 'rgba(0,0,0,.45)', color: '#fff' }}>{error || done}</p>}
        <div ref={strip} className="flex gap-2 overflow-x-auto no-scrollbar max-w-full px-4 py-1" role="tablist" aria-label="All avatars">
          {AVATARS.map((a, i) => (
            <button key={a.id} type="button" role="tab" aria-selected={i === idx} aria-label={a.name} onClick={() => goTo(i)} className="shrink-0 w-11 h-14 rounded-xl overflow-hidden cursor-pointer transition-transform" style={{ background: a.bg, outline: i === idx ? `2px solid ${text}` : '2px solid transparent', outlineOffset: 2, transform: i === idx ? 'scale(1.08)' : 'scale(1)', opacity: i === idx ? 1 : 0.8 }}>
              <img src={avatarUrl(a.id, '', origin)} alt="" draggable={false} loading="lazy" decoding="async" className="w-full h-full object-cover" style={{ objectPosition: '50% 8%', transform: 'scale(1.9)', transformOrigin: '50% 12%' }} />
            </button>))}
        </div>
      </div>

      {/* the sheet */}
      <div ref={dim} className="absolute inset-0 z-20" style={{ background: '#000', opacity: 0, pointerEvents: 'none' }} onClick={() => snapTo('closed')} aria-hidden="true" />
      <div ref={sheet} className="absolute inset-x-0 top-0 z-30 flex flex-col rounded-t-[28px] overflow-hidden" style={{ height: '100%', transform: 'translate3d(0, 100%, 0)', willChange: 'transform', background: glass, backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)', boxShadow: '0 -10px 40px rgba(0,0,0,.25)', color: text }} aria-hidden={open === 'closed'} data-testid="avatar-sheet" data-state={open}>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="shrink-0 flex flex-col items-center cursor-grab active:cursor-grabbing" style={{ height: HEADER_H, touchAction: 'none' }} data-testid="avatar-grip">
          <span className="mt-2.5 w-11 h-1.5 rounded-full" style={{ background: av.light ? 'rgba(20,22,28,.35)' : 'rgba(255,255,255,.55)' }} />
          <h2 className="mt-3 font-black uppercase text-[28px]" style={{ letterSpacing: '.16em', paddingLeft: '.16em' }}>{av.name}</h2>
          <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[12px] font-bold" style={{ color: soft }}><Sparkles className="w-3.5 h-3.5" aria-hidden="true" />{av.role}</p>
          <p className="mt-0.5 px-6 text-center text-[11.5px] italic truncate max-w-full" style={{ color: soft }}>{av.tagline}</p>
        </div>
        <div ref={scroller} className="px-5 overflow-y-auto overscroll-contain" style={{ height: 0, touchAction: 'pan-y' }} tabIndex={open === 'closed' ? -1 : 0}>
          <Heading c={soft}>Description</Heading>
          <p className="text-[13px] leading-relaxed" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{av.intro}</p>

          <Heading c={soft}>Clothing</Heading>
          <div className="space-y-3">
            {av.clothing.map((c) => (
              <div key={c.part} className="flex gap-3 items-start">
                <img src={avatarUrl(av.id, c.image, origin)} alt={`${av.name}: ${c.part}`} loading="lazy" decoding="async" className="w-20 h-20 rounded-2xl object-cover shrink-0" style={{ background: av.bg }} />
                <div className="min-w-0"><p className="text-[12px] font-extrabold uppercase tracking-wider">{c.part}</p><p className="text-[12.5px] leading-snug mt-0.5" style={{ color: soft }}>{c.text}</p></div>
              </div>))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">{av.extras.map((x) => <span key={x} className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: av.light ? 'rgba(20,22,28,.1)' : 'rgba(255,255,255,.18)' }}>{x}</span>)}</div>

          <Heading c={soft}>Style traits</Heading>
          <ul className="space-y-2.5">
            {av.traits.map(([t, d], k) => (
              <li key={t} className="flex gap-3 items-start">
                <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[13px] font-black" style={{ background: av.light ? 'rgba(20,22,28,.12)' : 'rgba(255,255,255,.2)' }}>{k + 1}</span>
                <div><p className="text-[12.5px] font-extrabold uppercase tracking-wider">{t}</p><p className="text-[12.5px] leading-snug" style={{ color: soft }}>{d}</p></div>
              </li>))}
          </ul>

          <Heading c={soft}>Info</Heading>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pb-6">
            {([['Role', av.role], ['Age', String(av.info.age)], ['Height', av.info.height], ['From', av.info.from], ['Vibe', av.info.vibe], ['Sound', av.info.sound]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-[10.5px] uppercase tracking-widest" style={{ color: soft }}>{k}</dt><dd className="text-[13px] font-bold">{v}</dd></div>))}
            <div className="col-span-2 flex items-center gap-2"><span className="w-5 h-5 rounded-full" style={{ background: av.bg, boxShadow: '0 0 0 2px rgba(255,255,255,.6)' }} /><span className="text-[13px] font-bold">{av.info.colour}</span><span className="text-[10.5px] uppercase tracking-widest" style={{ color: soft }}>signature colour</span></div>
          </dl>
        </div>
        <div className="shrink-0 px-5 flex items-center" style={{ height: CTA_H }}>
          <button type="button" onClick={() => void choose()} disabled={busy || isCurrent} className="w-full h-12 rounded-full font-extrabold text-sm cursor-pointer disabled:opacity-80 active:scale-[0.99] transition-transform inline-flex items-center justify-center gap-2" style={{ background: av.light ? '#14161c' : '#ffffff', color: av.light ? '#ffffff' : '#14161c' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrent ? <Check className="w-4 h-4" /> : null}{busy ? 'Saving…' : isCurrent ? 'This is your avatar' : `Use ${av.name} as my avatar`}
          </button>
        </div>
      </div>
    </div>
  );
};

const Heading: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => <h3 className="mt-5 mb-2 text-[12px] font-black uppercase tracking-[0.22em]" style={{ color: c }}>{children}</h3>;

export default AvatarPicker;
