import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Coins, Gift, History, Info, Loader2, Lock, Sparkles, Timer, Volume2, VolumeX, Zap } from 'lucide-react';
import type { User } from '../../types';
import { applyLiveAvatar, fetchNoobDraw, spinNoobDraw } from '../../services/api';
import { showNotice } from '../../utils/likeSync';
import {
  DrawHistoryItem, DrawPack, DrawPrize, DrawState, DrawWonPrize, RARITY, byRarityDesc, canAfford, formatCountdown, isPackOpen, msUntil, periodWord, pointsNeeded, priceShort, rarityOf
} from '../../utils/noobDraw';
import { PackArt, packLook } from './PackArt';
import { PrizeVisual } from './PrizeVisual';
import { DrawReel } from './DrawReel';
import { DrawResult } from './DrawResult';
import './draw.css';
import { buzz, fxEnabled, setFxEnabled, tickSound, unlockAudio } from './drawFx';

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
      type="button"
      onClick={onOpen}
      className={`dr-pack dr-rise ${wide ? 'dr-pack-wide' : ''} ${open ? 'is-open' : 'is-wait'}`}
      style={{ animationDelay: `${index * 70}ms`, ['--ac' as any]: look.accent, ['--ac-a' as any]: `${look.accent}30`, ['--ac-b' as any]: `${look.accent}66`, ['--glow' as any]: look.glow }}
    >
      <span className="dr-pack-halo" aria-hidden="true" />
      <div className="dr-pack-art">
        <div className={open ? 'draw-float' : 'dr-dim'} style={{ ['--tilt' as any]: tilt }}>
          <PackArt id={pack.id} className="dr-pack-svg" />
        </div>
        {!open && <div className="dr-lock"><Lock className="w-4 h-4" /></div>}
      </div>
      <div className="dr-pack-body">
        <p className="dr-pack-name">{pack.name}</p>
        <p className="dr-pack-tag">{pack.tagline}</p>
        {open ? (
          <div className="dr-chip dr-chip-go">
            <Zap className="w-3.5 h-3.5" /> Spin free
          </div>
        ) : (
          <div className="dr-pack-wait">
            <div className="dr-chip dr-chip-wait">
              <Timer className="w-3.5 h-3.5" /> Free in <Countdown to={pack.availableAt as string} onDone={onRefresh} />
            </div>
            <div className="dr-pack-again">
              <Coins className="w-3 h-3" /> Spin again · {priceShort(pack.price)}
            </div>
          </div>
        )}
        {!open && lastWin && <p className="dr-pack-last">Last win: <span style={{ color: RARITY[rarityOf(lastWin.rarity)].color }}>{lastWin.label}</span></p>}
      </div>
    </button>
  );
};

// ------------------------------------------------------------------------------------------------ the spin screen of one pack
const SpinScreen: React.FC<{ pack: DrawPack; balance: number; period: 'week' | 'month'; onUserUpdated: (u: User) => void; onRefresh: () => Promise<void>; onSpun: () => void }> = ({ pack, balance, period, onUserUpdated, onRefresh, onSpun }) => {
  const look = packLook(pack.id);
  const [spinKey, setSpinKey] = useState(0);
  const [winner, setWinner] = useState<DrawPrize | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DrawWonPrize | null>(null);
  const [wearing, setWearing] = useState(false);
  const [confirming, setConfirming] = useState(false);     // asking before NOOB Points are spent
  const held = useRef<{ user?: User; prize: DrawWonPrize } | null>(null);
  const onUserUpdatedRef = useRef(onUserUpdated);
  onUserUpdatedRef.current = onUserUpdated;
  const sorted = useMemo(() => [...pack.prizes].sort(byRarityDesc), [pack.prizes]);
  const free = isPackOpen(pack);
  const afford = canAfford(balance, pack.price);

  // the balance must not change before the reel stops (it would give the prize away); if the person leaves mid-spin it is applied then
  useEffect(() => () => { if (held.current?.user) onUserUpdatedRef.current(held.current.user); }, []);

  // paid = false: the free spin. paid = true: one more spin for NOOB Points (only once the free one is used).
  const spin = async (paid: boolean) => {
    if (spinning || (!paid && !isPackOpen(pack)) || (paid && isPackOpen(pack))) return;
    unlockAudio();                       // phones only allow sound that starts inside a tap: do it before anything is awaited
    buzz(15);
    setConfirming(false);
    setSpinning(true);
    setError('');
    const res = await spinNoobDraw(pack.id, paid);
    if (!res.success || !res.prize) {
      setSpinning(false);
      setError(friendlyError(res.error));
      if (res.availableAt || res.freeReady || res.needPoints) void onRefresh();
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
    <div className="dr-spin">
      <div className="dr-wrap" style={{ ['--ac' as any]: look.accent, ['--ac-a' as any]: `${look.accent}30`, ['--ac-b' as any]: `${look.accent}66`, ['--glow' as any]: look.glow }}>
        <div className="dr-spin-head dr-rise">
          <PackArt id={pack.id} className="dr-spin-art" />
          <div className="min-w-0 flex-1">
            <h2 className="dr-h2">{pack.name}</h2>
            <p className="dr-sub">{pack.tagline} · {sorted.length} prizes</p>
          </div>
          <span className={`dr-tag ${free ? 'is-free' : ''}`}>{free ? 'Free spin ready' : `${priceShort(pack.price)} / spin`}</span>
        </div>

        <div className="dr-reel-stage dr-rise" style={{ animationDelay: '60ms' }}>
          <div className="dr-spot" aria-hidden="true" />
          <div className="relative"><DrawReel prizes={pack.prizes} accent={look.accent} spinKey={spinKey} winner={winner} onLanded={landed} /></div>
        </div>

        {error && <p className="dr-error" role="alert">{error}</p>}

        <div className="dr-wallet dr-rise" style={{ animationDelay: '120ms' }}>
          <div className="dr-wallet-cell">
            <span className="dr-wallet-k">Your balance</span>
            <span className="dr-wallet-v"><Coins className="w-4 h-4" style={{ color: '#ffae42' }} /> {Number(balance).toLocaleString('en-US')}</span>
          </div>
          <div className="dr-wallet-cell">
            <span className="dr-wallet-k">This spin costs</span>
            <span className="dr-wallet-v">{free ? 'Free' : `${priceShort(pack.price)} points`}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (free ? void spin(false) : setConfirming(true))}
          disabled={spinning || (!free && !afford)}
          className={`dr-cta ${spinning ? 'is-busy' : free ? 'is-free draw-glow' : afford ? 'is-paid' : 'is-off'}`}
        >
          {spinning ? <><Loader2 className="w-5 h-5 animate-spin" /> Spinning</>
            : free ? <><Sparkles className="w-5 h-5" /> Spin now · Free</>
            : afford ? <><Coins className="w-5 h-5" /> Spin again · {priceShort(pack.price)} points</>
            : <><Coins className="w-4.5 h-4.5" /> Need {priceShort(pointsNeeded(balance, pack.price))} more points</>}
        </button>
        <p className="dr-fine">
          {free
            ? <>One free spin of every pack each {period}. After that you can spin again for {priceShort(pack.price)} points, as often as you like.</>
            : <>Your free spin comes back in <b><Countdown to={pack.availableAt as string} onDone={() => void onRefresh()} /></b>. Until then every spin is {priceShort(pack.price)} points.</>}
        </p>

        <section className="dr-sec">
          <div className="dr-sec-head">
            <h3 className="dr-h3">What is inside</h3>
            <span className="dr-faint">Real odds</span>
          </div>
          <div className="dr-list">
            {sorted.map((p, i) => {
              const r = RARITY[p.rarity];
              return (
                <div key={p.id} className="dr-row dr-rise" style={{ ['--rc' as any]: r.color, ['--rs' as any]: r.soft, animationDelay: `${180 + Math.min(i, 10) * 40}ms` }}>
                  <div className="dr-row-pic"><PrizeVisual prize={p} size={40} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="dr-row-t">{p.label}</p>
                    <p className="dr-row-s">{p.subtitle}</p>
                  </div>
                  <div className="dr-row-r">
                    <p className="dr-rar">{r.label}</p>
                    <p className="dr-odds">{oddsText(p.odds)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {confirming && (
        <div className="dr-sheet-bg edge-own" onClick={() => setConfirming(false)}>
          <div className="dr-sheet" role="dialog" aria-label="Confirm spin" onClick={(e) => e.stopPropagation()} style={{ ['--ac' as any]: look.accent, ['--glow' as any]: look.glow }}>
            <span className="dr-grab" aria-hidden="true" />
            <div className="dr-sheet-art"><PackArt id={pack.id} className="dr-sheet-svg" /></div>
            <p className="dr-sheet-t">Spin the {pack.name} again?</p>
            <p className="dr-sheet-p">This takes <b>{Number(pack.price).toLocaleString('en-US')}</b> NOOB Points from your wallet (you have {Number(balance).toLocaleString('en-US')}). The prize is paid out the moment the reel stops.</p>
            <div className="dr-sheet-btns">
              <button type="button" onClick={() => setConfirming(false)} className="dr-btn-ghost">Cancel</button>
              <button type="button" onClick={() => void spin(true)} className="dr-btn-solid">Spin · {priceShort(pack.price)}</button>
            </div>
          </div>
        </div>
      )}
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
  const [fx, setFx] = useState(fxEnabled());      // sound and vibration on / off

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

  const balanceNow = Number(currentUser.noobPoints || 0);
  return (
    <div className="dr-root fixed inset-0 z-[210] edge-own" role="dialog" aria-label="NOOB Draw">
      <div className="dr-bg" aria-hidden="true">
        <span className="dr-orb dr-orb-a" /><span className="dr-orb dr-orb-b" /><span className="dr-orb dr-orb-c" />
        <span className="draw-twinkle dr-star" style={{ top: '14%', left: '12%' }} />
        <span className="draw-twinkle dr-star" style={{ top: '26%', right: '9%', animationDelay: '0.9s' }} />
        <span className="draw-twinkle dr-star" style={{ top: '58%', left: '6%', animationDelay: '1.6s' }} />
        <span className="draw-twinkle dr-star" style={{ top: '78%', right: '14%', animationDelay: '0.4s' }} />
      </div>

      {/* top bar: it starts above the notch, the buttons sit below it */}
      <header className="dr-head">
        <button type="button" onClick={goBack} className="dr-iconbtn" aria-label={active ? 'Back to all spins' : 'Close'}><ChevronLeft className="w-5 h-5" /></button>
        <div className="dr-brand">
          <span className="dr-brand-mark"><Gift className="w-4 h-4" /></span>
          <span className="dr-brand-name">NOOB DRAW</span>
        </div>
        <div className="dr-head-r">
          <button
            type="button"
            onClick={() => { const next = !fx; setFxEnabled(next); setFx(next); if (next) { unlockAudio(); tickSound(0.5); buzz(20); } }}
            className="dr-iconbtn"
            aria-label={fx ? 'Turn sound and vibration off' : 'Turn sound and vibration on'}
            title={fx ? 'Sound and vibration on' : 'Sound and vibration off'}
          >
            {fx ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 dr-faint" />}
          </button>
          <div className="dr-bal"><Coins className="w-3.5 h-3.5" style={{ color: '#ffae42' }} /> {balanceNow.toLocaleString('en-US')}</div>
        </div>
      </header>

      <div className="dr-scroll">
        {!state ? (
          <div className="dr-wrap">
            {failed ? (
              <div className="dr-fail">
                <p className="dr-fail-t">NOOB Draw could not load</p>
                <p className="dr-fail-p">Check your connection and try again. If it keeps happening, the update may still be installing.</p>
                <button type="button" onClick={() => { setFailed(false); void refresh(); }} className="dr-btn-solid">Try again</button>
              </div>
            ) : (
              <>
                <div className="dr-skel" style={{ height: 210, borderRadius: 28 }} />
                <div className="dr-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="dr-skel" style={{ height: 250, borderRadius: 26 }} />)}</div>
              </>
            )}
          </div>
        ) : active ? (
          <SpinScreen key={active.id} pack={active} balance={balanceNow} period={periodWord(state.freePeriod)} onUserUpdated={onUserUpdated} onRefresh={refresh} onSpun={() => { /* the list is refreshed when the result is closed */ }} />
        ) : (
          <div className="dr-wrap">
            {/* hero */}
            <section className="dr-hero dr-rise">
              <p className="dr-kicker">Free spins every {periodWord(state.freePeriod)}</p>
              <h1 className="dr-title draw-title">NOOB DRAW</h1>
              <p className="dr-lede">Open every pack once a {periodWord(state.freePeriod)}, for free, or spin again with NOOB Points. Win NOOB Pro, the verified tick, live profile pictures, stickers and millions of points.</p>
              <div className="dr-status">
                {ready > 0 ? <><span className="dr-dot" /> {ready} of {state.packs.length} free spins ready</>
                  : nextOpening ? <><Timer className="w-3.5 h-3.5" /> Next free spin in <Countdown to={nextOpening} onDone={() => void refresh()} /></>
                  : <>All free spins used this {periodWord(state.freePeriod)}</>}
              </div>
              <div className="dr-hero-wallet">
                <span className="dr-wallet-k">Your balance</span>
                <span className="dr-hero-bal"><Coins className="w-5 h-5" style={{ color: '#ffae42' }} /> {balanceNow.toLocaleString('en-US')}</span>
              </div>
            </section>

            {/* live big wins */}
            {tickerItems.length > 0 && (
              <section aria-label="Recent big wins" className="dr-ticker dr-rise" style={{ animationDelay: '60ms' }}>
                <div className="draw-marquee dr-ticker-in">
                  {[...tickerItems, ...tickerItems].map((t, i) => {
                    const c = RARITY[rarityOf(t.rarity)].color;
                    return (
                      <span key={i} className="dr-tick">
                        <span className="dr-tick-dot" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                        <b>@{t.username}</b> <span className="dr-faint">won</span> <b style={{ color: c }}>{t.label}</b>
                        {t.packName && <span className="dr-faint">in {t.packName}</span>}
                      </span>
                    );
                  })}
                </div>
              </section>
            )}

            {/* the five spins */}
            <section className="dr-sec">
              <h3 className="dr-h3">Choose your spin</h3>
              <div className="dr-grid">
                {state.packs.map((p, i) => (
                  <PackCard key={p.id} pack={p} index={i} wide={i === state.packs.length - 1 && state.packs.length % 2 === 1} lastWin={lastWinOf(p.id)} onOpen={() => setActiveId(p.id)} onRefresh={() => void refresh()} />
                ))}
              </div>
              <p className="dr-info"><Info className="w-3.5 h-3.5 shrink-0" /> <span>Every pack gives one free spin each {periodWord(state.freePeriod)}. After that you can spin again for {priceShort(state.packs[0]?.price || 100000000)} points, as often as you like. The prize is picked by NOOB's server, never by your phone, and paid out the moment the reel stops.</span></p>
            </section>

            {/* live pictures won */}
            {state.unlockedAvatars.length > 0 && (
              <section className="dr-sec">
                <h3 className="dr-h3">My live pictures</h3>
                <div className="dr-avatars no-scrollbar">
                  {state.unlockedAvatars.map((a) => (
                    <div key={a.id} className="dr-ava">
                      <img src={a.url} alt="" className="dr-ava-img" draggable={false} />
                      <p className="dr-ava-n">{a.name}</p>
                      <button type="button" onClick={() => wear(a.id, a.name)} disabled={!!wearing} className="dr-wear">
                        {wearing === a.id ? '...' : 'Wear'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* my wins */}
            <section className="dr-sec">
              <h3 className="dr-h3"><History className="w-3.5 h-3.5" /> My wins</h3>
              {state.history.length === 0 ? (
                <p className="dr-empty">Nothing yet. Pick a spin above and open your first pack.</p>
              ) : (
                <div className="dr-list">
                  {state.history.map((h, i) => {
                    const r = RARITY[rarityOf(h.rarity)];
                    return (
                      <div key={i} className="dr-row dr-hist" style={{ ['--rc' as any]: r.color, ['--rs' as any]: r.soft }}>
                        <div className="min-w-0 flex-1">
                          <div className="dr-hist-top">
                            <p className="dr-row-t">{h.label}</p>
                            <span className="dr-rar">{r.label}</span>
                          </div>
                          <p className="dr-row-s">{h.packName || 'Spin'} · {new Date(h.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{h.paid ? ` · paid ${priceShort(Number(h.cost) || 0)}` : ' · free'}</p>
                          {h.message && <p className="dr-hist-m">{h.message}</p>}
                        </div>
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
