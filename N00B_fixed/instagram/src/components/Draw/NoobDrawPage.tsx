import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Coins, Gift, History, Info, Loader2, Lock, Sparkles, Timer, Zap } from 'lucide-react';
import type { User } from '../../types';
import { applyLiveAvatar, fetchNoobDraw, spinNoobDraw } from '../../services/api';
import { showNotice } from '../../utils/likeSync';
import {
  DrawHistoryItem, DrawPack, DrawPrize, DrawState, DrawWonPrize, RARITY, byRarityDesc, formatCountdown, isPackOpen, msUntil, rarityOf
} from '../../utils/noobDraw';
import { PackArt, packLook } from './PackArt';
import { PrizeVisual } from './PrizeVisual';
import { DrawReel } from './DrawReel';
import { DrawResult } from './DrawResult';

interface NoobDrawPageProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
  onClose: () => void;
}

// A live countdown to `to`; asks for a refresh when it reaches zero.
const Countdown: React.FC<{ to: string; onDone?: () => void }> = ({ to, onDone }) => {
  const [ms, setMs] = useState(() => msUntil(to));
  useEffect(() => {
    setMs(msUntil(to));
    const t = window.setInterval(() => {
      const left = msUntil(to);
      setMs(left);
      if (left <= 0) { window.clearInterval(t); onDone?.(); }
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return <>{formatCountdown(ms)}</>;
};

const oddsText = (n: number) => `${Number(n.toFixed(2))}%`;

const friendlyError = (msg?: string) => (/function|schema cache|does not exist|could not find/i.test(msg || '') && !/already used/i.test(msg || '')
  ? 'NOOB Draw is not switched on yet. Please try again a little later.'
  : msg || 'Could not spin right now. Please try again.');

// ------------------------------------------------------------------------------------------------ one pack on the main page
const PackCard: React.FC<{ pack: DrawPack; index: number; wide: boolean; lastWin?: DrawHistoryItem; onOpen: () => void; onRefresh: () => void }> = ({ pack, index, wide, lastWin, onOpen, onRefresh }) => {
  const look = packLook(pack.id);
  const open = isPackOpen(pack);
  const tilt = ['-3deg', '2.5deg', '-2deg', '3deg', '0deg'][index % 5];
  return (
    <button
      onClick={onOpen}
      className={`draw-rise relative text-left rounded-[26px] border overflow-hidden active:scale-[0.98] transition-transform cursor-pointer ${wide ? 'col-span-2 flex items-center gap-4 p-4' : 'p-3 pb-3.5'}`}
      style={{ animationDelay: `${index * 70}ms`, borderColor: `${look.accent}44`, background: `linear-gradient(155deg, ${look.accent}24 0%, rgba(14,14,22,0.93) 58%)`, ['--glow' as any]: look.glow }}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-40" style={{ background: look.accent }} />
      <div className={`relative flex justify-center ${wide ? 'shrink-0' : ''}`}>
        <div className={open ? 'draw-float' : 'opacity-55 saturate-50'} style={{ ['--tilt' as any]: tilt }}>
          <PackArt id={pack.id} className={wide ? 'w-[104px] h-[138px]' : 'w-[108px] h-[143px]'} />
        </div>
        {!open && <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-black/60 border border-white/20 flex items-center justify-center"><Lock className="w-4.5 h-4.5 text-white" /></div></div>}
      </div>
      <div className={`relative ${wide ? 'flex-1 min-w-0' : 'mt-2.5 text-center'}`}>
        <p className="text-[15px] font-black italic tracking-tight text-white leading-tight">{pack.name}</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">{pack.tagline}</p>
        {open ? (
          <div className="draw-glow mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider text-black" style={{ background: `linear-gradient(90deg, ${look.accent}, #fff)`, ['--glow' as any]: look.glow }}>
            <Zap className="w-3.5 h-3.5" /> Spin free
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-bold text-zinc-200 bg-white/8 border border-white/10">
            <Timer className="w-3.5 h-3.5 text-zinc-400" /> Opens in <Countdown to={pack.availableAt as string} onDone={onRefresh} />
          </div>
        )}
        {!open && lastWin && <p className="text-[10px] text-zinc-500 mt-2 truncate">Last win: <span style={{ color: RARITY[rarityOf(lastWin.rarity)].color }}>{lastWin.label}</span></p>}
      </div>
    </button>
  );
};

// ------------------------------------------------------------------------------------------------ the spin screen of one pack
const SpinScreen: React.FC<{ pack: DrawPack; onUserUpdated: (u: User) => void; onRefresh: () => Promise<void>; onSpun: () => void }> = ({ pack, onUserUpdated, onRefresh, onSpun }) => {
  const look = packLook(pack.id);
  const [spinKey, setSpinKey] = useState(0);
  const [winner, setWinner] = useState<DrawPrize | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DrawWonPrize | null>(null);
  const [wearing, setWearing] = useState(false);
  const held = useRef<{ user?: User; prize: DrawWonPrize } | null>(null);
  const onUserUpdatedRef = useRef(onUserUpdated);
  onUserUpdatedRef.current = onUserUpdated;
  const sorted = useMemo(() => [...pack.prizes].sort(byRarityDesc), [pack.prizes]);
  const open = isPackOpen(pack) && !spinning;

  // the balance must not change before the reel stops (it would give the prize away); if the person leaves mid-spin it is applied then
  useEffect(() => () => { if (held.current?.user) onUserUpdatedRef.current(held.current.user); }, []);

  const spin = async () => {
    if (spinning || !isPackOpen(pack)) return;
    setSpinning(true);
    setError('');
    const res = await spinNoobDraw(pack.id);
    if (!res.success || !res.prize) {
      setSpinning(false);
      setError(friendlyError(res.error));
      if (res.availableAt) void onRefresh();
      return;
    }
    held.current = { user: res.user, prize: res.prize };
    setWinner(pack.prizes.find((p) => p.id === res.prize!.id) || { ...res.prize, odds: res.prize.odds ?? 0 });
    setSpinKey((k) => k + 1);
  };

  const landed = useCallback(() => {
    const h = held.current;
    if (!h) { setSpinning(false); return; }
    if (h.user) onUserUpdatedRef.current(h.user);
    held.current = null;
    setSpinning(false);
    setResult(h.prize);
    onSpun();
  }, [onSpun]);

  const wear = async () => {
    if (!result?.presetId || wearing) return;
    setWearing(true);
    const res = await applyLiveAvatar({ presetId: result.presetId });
    setWearing(false);
    if (res.success && res.user) { onUserUpdatedRef.current(res.user); showNotice('Your new live profile picture is on'); }
    else showNotice(res.error || 'Could not apply that picture');
  };

  return (
    <div className="relative min-h-full">
      <div className="px-4 pt-3 pb-28 space-y-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          <PackArt id={pack.id} className="w-10 h-[53px] shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]" />
          <div className="min-w-0">
            <h2 className="draw-sans text-lg italic tracking-tight text-white leading-none">{pack.name}</h2>
            <p className="text-[11px] text-zinc-400 mt-1">{pack.tagline} · {sorted.length} prizes</p>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute -inset-x-6 -top-8 h-40 blur-3xl opacity-40" style={{ background: `radial-gradient(closest-side, ${look.accent}, transparent)` }} />
          <div className="relative"><DrawReel prizes={pack.prizes} accent={look.accent} spinKey={spinKey} winner={winner} onLanded={landed} /></div>
        </div>

        {error && <p className="text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-2xl px-3.5 py-2.5 text-center">{error}</p>}

        <button
          onClick={spin}
          disabled={!open}
          className={`w-full py-4 rounded-2xl font-black text-[15px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-transform ${open ? 'draw-glow draw-shine text-black active:scale-[0.98] cursor-pointer' : 'bg-white/8 border border-white/10 text-zinc-300 cursor-not-allowed'}`}
          style={open ? { background: `linear-gradient(90deg, ${look.accent}, #fff 55%, ${look.accent})`, ['--glow' as any]: look.glow } : undefined}
        >
          {spinning ? <><Loader2 className="w-5 h-5 animate-spin" /> Spinning</>
            : isPackOpen(pack) ? <><Sparkles className="w-5 h-5" /> Spin now · Free</>
            : <><Lock className="w-4.5 h-4.5" /> Opens in <Countdown to={pack.availableAt as string} onDone={() => void onRefresh()} /></>}
        </button>
        <p className="text-[11px] text-zinc-500 text-center -mt-2">One free spin of every pack, every 7 days.</p>

        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">What is inside</h3>
            <span className="text-[10px] text-zinc-500">Real odds</span>
          </div>
          <div className="space-y-2">
            {sorted.map((p) => {
              const r = RARITY[p.rarity];
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: `${r.color}30`, background: `linear-gradient(90deg, ${r.soft}, rgba(14,14,22,0.7) 60%)` }}>
                  <div className="w-11 flex justify-center shrink-0"><PrizeVisual prize={p} size={40} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white truncate">{p.label}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{p.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: r.color }}>{r.label}</p>
                    <p className="text-[11px] font-bold text-zinc-200 mt-0.5">{oddsText(p.odds)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {result && <DrawResult prize={result} packName={pack.name} wearing={wearing} onWear={result.presetId ? wear : undefined} onClose={() => { setResult(null); void onRefresh(); }} />}
    </div>
  );
};

// ------------------------------------------------------------------------------------------------ the page
export const NoobDrawPage: React.FC<NoobDrawPageProps> = ({ currentUser, onUserUpdated, onClose }) => {
  const [state, setState] = useState<DrawState | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wearing, setWearing] = useState('');

  const refresh = useCallback(async () => {
    const s = await fetchNoobDraw();
    if (s) { setState(s); setFailed(false); } else setFailed(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const goBack = useCallback(() => { if (activeId) setActiveId(null); else onClose(); }, [activeId, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack]);

  const active = state?.packs.find((p) => p.id === activeId) || null;
  const ready = state ? state.packs.filter((p) => isPackOpen(p)).length : 0;
  const nextOpening = state && ready === 0 ? state.packs.map((p) => p.availableAt).filter(Boolean).sort()[0] || null : null;
  const lastWinOf = (packId: string) => state?.history.find((h) => h.pack === packId);

  const wear = async (presetId: string, name: string) => {
    if (wearing) return;
    setWearing(presetId);
    const res = await applyLiveAvatar({ presetId });
    setWearing('');
    if (res.success && res.user) { onUserUpdated(res.user); showNotice(`${name} is now your profile picture`); } else showNotice(res.error || 'Could not apply that picture');
  };

  const tickerItems = useMemo(() => {
    const t = state?.ticker || [];
    if (!t.length) return [];
    const out: typeof t = [];
    while (out.length < 8) out.push(...t);       // long enough that the loop never shows a gap
    return out;
  }, [state?.ticker]);

  return (
    <div className="fixed inset-0 z-[210] draw-stage text-white force-dark flex flex-col" role="dialog" aria-label="NOOB Draw">
      {/* top bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/8 bg-black/30 backdrop-blur-xl">
        <button onClick={goBack} className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center cursor-pointer" aria-label={active ? 'Back to all spins' : 'Close'}><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#c9c6ff] to-[#f0abfc] flex items-center justify-center"><Gift className="w-4 h-4 text-black" /></span>
          <span className="text-[15px] font-black italic tracking-tight">NOOB DRAW</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-white/8 border border-white/10 text-[12px] font-extrabold tabular-nums">
          <Coins className="w-3.5 h-3.5 text-amber-300" /> {Number(currentUser.noobPoints || 0).toLocaleString('en-US')}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {!state ? (
          <div className="px-4 pt-6 max-w-lg mx-auto space-y-4">
            {failed ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
                <p className="text-sm font-bold">NOOB Draw could not load</p>
                <p className="text-xs text-zinc-400">Check your connection and try again. If it keeps happening, the update may still be installing.</p>
                <button onClick={() => { setFailed(false); void refresh(); }} className="px-5 py-2.5 rounded-xl bg-white text-black text-xs font-bold cursor-pointer">Try again</button>
              </div>
            ) : (
              <>
                <div className="h-44 rounded-[28px] bg-white/5 animate-pulse" />
                <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-60 rounded-[26px] bg-white/5 animate-pulse" />)}</div>
              </>
            )}
          </div>
        ) : active ? (
          <SpinScreen key={active.id} pack={active} onUserUpdated={onUserUpdated} onRefresh={refresh} onSpun={() => { /* the list is refreshed when the result is closed */ }} />
        ) : (
          <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-5">
            {/* hero */}
            <section className="relative rounded-[28px] overflow-hidden border border-white/12 px-5 py-6 text-center" style={{ background: 'linear-gradient(150deg, rgba(158,156,255,0.22) 0%, rgba(236,72,153,0.12) 48%, rgba(14,14,22,0.9) 100%)' }}>
              <div className="pointer-events-none absolute inset-0">
                <span className="draw-twinkle absolute top-5 left-8 w-1.5 h-1.5 rounded-full bg-white" />
                <span className="draw-twinkle absolute top-10 right-10 w-1 h-1 rounded-full bg-white" style={{ animationDelay: '0.9s' }} />
                <span className="draw-twinkle absolute bottom-8 left-14 w-1 h-1 rounded-full bg-white" style={{ animationDelay: '1.6s' }} />
                <span className="draw-twinkle absolute bottom-5 right-6 w-1.5 h-1.5 rounded-full bg-white" style={{ animationDelay: '0.4s' }} />
              </div>
              <p className="relative text-[10px] font-bold uppercase tracking-[0.36em] text-[#c9c6ff]">Weekly free spins</p>
              <h1 className="relative draw-title draw-sans text-[38px] italic tracking-tight leading-none mt-2">NOOB DRAW</h1>
              <p className="relative text-xs text-zinc-300/90 mt-3 leading-relaxed max-w-xs mx-auto">Open every pack once a week, for free. Win NOOB Pro, the verified tick, live profile pictures, stickers and millions of points.</p>
              <div className="relative mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/35 border border-white/12 text-[11px] font-bold">
                {ready > 0 ? <><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {ready} of {state.packs.length} spins ready</>
                  : nextOpening ? <><Timer className="w-3.5 h-3.5 text-zinc-400" /> Next spin in <Countdown to={nextOpening} onDone={() => void refresh()} /></>
                  : <>All spins used this week</>}
              </div>
            </section>

            {/* live big wins */}
            {tickerItems.length > 0 && (
              <section aria-label="Recent big wins" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] py-2.5">
                <div className="draw-marquee flex gap-8 w-max px-4">
                  {[...tickerItems, ...tickerItems].map((t, i) => {
                    const c = RARITY[rarityOf(t.rarity)].color;
                    return (
                      <span key={i} className="flex items-center gap-2 text-[11px] whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                        <b className="text-zinc-200">@{t.username}</b> <span className="text-zinc-500">won</span> <b style={{ color: c }}>{t.label}</b>
                        {t.packName && <span className="text-zinc-600">in {t.packName}</span>}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {/* the five spins */}
            <section>
              <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400 mb-3">Choose your spin</h3>
              <div className="grid grid-cols-2 gap-3">
                {state.packs.map((p, i) => (
                  <PackCard key={p.id} pack={p} index={i} wide={i === state.packs.length - 1 && state.packs.length % 2 === 1} lastWin={lastWinOf(p.id)} onOpen={() => setActiveId(p.id)} onRefresh={() => void refresh()} />
                ))}
              </div>
              <p className="flex items-start gap-2 text-[11px] text-zinc-500 mt-3 leading-relaxed"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> You can spin each of the five packs once every 7 days. The prize is picked by NOOB's server, never by your phone, and paid out the moment the reel stops.</p>
            </section>

            {/* live pictures won */}
            {state.unlockedAvatars.length > 0 && (
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400 mb-3">My live pictures</h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {state.unlockedAvatars.map((a) => (
                    <div key={a.id} className="shrink-0 w-28 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
                      <img src={a.url} alt="" className="w-14 h-14 rounded-full mx-auto object-cover border border-white/20" draggable={false} />
                      <p className="text-[11px] font-bold mt-2 truncate">{a.name}</p>
                      <button onClick={() => wear(a.id, a.name)} disabled={!!wearing} className="mt-2 w-full py-1.5 rounded-lg bg-white text-black text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                        {wearing === a.id ? '...' : 'Wear'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* my wins */}
            <section>
              <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400 mb-3"><History className="w-3.5 h-3.5" /> My wins</h3>
              {state.history.length === 0 ? (
                <p className="text-xs text-zinc-500 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">Nothing yet. Pick a spin above and open your first pack.</p>
              ) : (
                <div className="space-y-2">
                  {state.history.map((h, i) => {
                    const r = RARITY[rarityOf(h.rarity)];
                    return (
                      <div key={i} className="rounded-2xl border px-3.5 py-2.5" style={{ borderColor: `${r.color}30`, background: `linear-gradient(90deg, ${r.soft}, rgba(14,14,22,0.7) 65%)` }}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[13px] font-bold text-white truncate">{h.label}</p>
                          <span className="text-[9px] font-black uppercase tracking-[0.14em] shrink-0" style={{ color: r.color }}>{r.label}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{h.packName || 'Spin'} · {new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                        {h.message && <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{h.message}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoobDrawPage;
