import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { setMyMoodUntil, fetchMyMood } from '../../services/api';
import { MOODS as ALL_MOODS, type MoodId } from '../../utils/moods';
import { SLIDER_ORDER, moodAt, nearestMood } from '../../utils/moodSlider';

// the eight moods in the order of the slider (low to high)
const MOODS = SLIDER_ORDER.map((id) => ALL_MOODS.find((m) => m.id === id)!);
import type { FunPageProps } from './types';

// Mood: one full screen. The whole page takes the colour of how you feel, a face that follows your finger shows it, and a ruler at the bottom is the slider. The word at the top
// is the mood. Letting go of the slider only picks the mood: the black "Save mood" button at the bottom saves it (who can see it stays as it was set; a new mood is for
// followers). A saved mood clears itself at the next 12 midnight of the person's own time (migration 20261106000001), and the database still decides who sees what (migration
// 20261016000003). The old page with the note, the lists and the choices is kept in MoodClassic.tsx.

const PAD = 34;            // space left and right of the ruler (px)
const PANEL_H = 232;       // the white panel at the bottom (px): the ruler, the Save button and one line under it

// the next 12 midnight of the person's own time
const nextMidnight = (): Date => { const d = new Date(); d.setHours(24, 0, 0, 0); return d; };

export interface MoodPageProps extends FunPageProps { onBack?: () => void }

const MoodPage: React.FC<MoodPageProps> = ({ currentUser, onLogin, onBack }) => {
  const last = MOODS.length - 1;
  const [shown, setShown] = useState((MOODS.findIndex((m) => m.id === 'happy')) / last);   // what is drawn now (chases the finger smoothly)
  const target = useRef(shown);
  const dragging = useRef(false);
  const raf = useRef(0);
  const wrap = useRef<HTMLDivElement | null>(null);
  const kept = useRef<{ visibility: 'everyone' | 'followers' | 'only_me'; note: string }>({ visibility: 'followers', note: '' });
  const savedMood = useRef<MoodId | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pickedId, setPickedId] = useState<MoodId | null>(null);   // what the slider is on now
  const [savedId, setSavedId] = useState<MoodId | null>(null);     // what is saved
  const touched = useRef(false);
  const [problem, setProblem] = useState('');
  const [width, setWidth] = useState(375);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const read = () => setWidth(el.clientWidth || 375);
    read();
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // my mood from the database: the slider starts there
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    void fetchMyMood().then((m) => {
      if (!alive || !m || touched.current) return;
      const i = MOODS.findIndex((x) => x.id === m.mood);
      if (i < 0) return;
      savedMood.current = m.mood as MoodId;
      kept.current = { visibility: m.visibility ?? 'followers', note: m.note ?? '' };
      setSavedId(m.mood as MoodId); setPickedId(m.mood as MoodId);
      target.current = i / last; shownRef.current = i / last; setShown(i / last);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [currentUser?.id, last]);

  // the drawn value chases the wanted one: smooth while dragging, a calm settle when let go
  const shownRef = useRef(shown);
  const run = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const tick = () => {
      const d = target.current - shownRef.current;
      if (Math.abs(d) < 0.0006) { shownRef.current = target.current; setShown(target.current); return; }
      shownRef.current += d * (dragging.current ? 0.3 : 0.16);
      setShown(shownRef.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => { cancelAnimationFrame(raf.current); }, []);

  const valueAt = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    const w = r?.width || width;
    return Math.min(1, Math.max(0, (clientX - (r?.left || 0) - PAD) / (w - PAD * 2)));
  };

  // the Save mood button: saves the mood the slider is on, to clear itself at the next 12 midnight
  const save = useCallback(async () => {
    const id = nearestMood(target.current, last);
    const mood = MOODS[id].id;
    if (!currentUser) { onLogin?.(); return; }
    setSaveState('saving'); setProblem('');
    try {
      await setMyMoodUntil({ mood, note: kept.current.note, visibility: kept.current.visibility, expiresAt: nextMidnight() });
      savedMood.current = mood; setSavedId(mood); setSaveState('saved');
      try { navigator.vibrate?.(10); } catch { /* not everywhere */ }
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2200);
    } catch { setProblem('Not saved. Check your connection.'); setSaveState('idle'); }
  }, [currentUser, last, onLogin]);

  const down = (e: React.PointerEvent) => {
    touched.current = true; dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    target.current = valueAt(e.clientX); run();
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const before = nearestMood(target.current, last);
    target.current = valueAt(e.clientX);
    if (nearestMood(target.current, last) !== before) { try { navigator.vibrate?.(6); } catch { /* not everywhere */ } setSaveState((s) => (s === 'saved' ? 'idle' : s)); }
    run();
  };
  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    target.current = nearestMood(target.current, last) / last;   // settle on the nearest mood
    run();
    setPickedId(MOODS[nearestMood(target.current, last)].id);
  };

  const m = moodAt(shown);
  const idx = nearestMood(shown, last);
  const trackW = Math.max(1, width - PAD * 2);
  const knobX = PAD + shown * trackW;

  return (
    <div
      ref={wrap}
      className="fixed inset-0 z-[96] overflow-hidden select-none text-white"
      style={{ background: m.color, touchAction: 'none', transition: 'none' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role="application" aria-label="Mood"
    >
      {onBack && (
        <button type="button" aria-label="Go back" onPointerDown={(e) => e.stopPropagation()} onClick={onBack}
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center cursor-pointer active:scale-95 transition-transform z-10">
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* the mood, in words */}
      <div className="absolute left-0 right-0 text-center font-bold tracking-tight pointer-events-none" style={{ top: '11%', fontSize: 'clamp(40px, 12vw, 56px)', color: '#000', textShadow: 'none' }} data-testid="mood-word" aria-live="polite">
        {MOODS[idx].label.toLowerCase()}
      </div>

      {/* the face */}
      <svg viewBox="0 0 375 300" className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: '19%', width: 'min(100%, 460px)' }} aria-hidden="true">
        <defs>
          <filter id="mood-soft" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="9" floodColor="#000" floodOpacity=".28" /></filter>
          <filter id="mood-lip" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="3" floodColor="#000" floodOpacity=".3" /></filter>
        </defs>
        {[-1, 1].map((side) => {
          const cx = 187.5 + side * 80, cy = 120;
          const brow = side < 0 ? m.browL : m.browR;
          return (
            <g key={side}>
              <rect x={cx - 38} y={cy - m.eyeH / 2 - brow.gap - 5} width="76" height="10" rx="5" fill="#1b1b1b" transform={`rotate(${brow.rot} ${cx} ${cy - m.eyeH / 2 - brow.gap})`} />
              <ellipse cx={cx} cy={cy} rx={m.eyeW / 2} ry={m.eyeH / 2} fill="#fff" filter="url(#mood-soft)" />
              <ellipse cx={cx + m.pdx} cy={cy + m.pdy} rx={Math.min(m.pupil / 2, m.eyeW / 2 - 3)} ry={Math.min(m.pupil / 2, m.eyeH / 2 - 2)} fill="#111" />
              <circle cx={cx + m.pdx - m.pupil * 0.16} cy={cy + m.pdy - m.pupil * 0.18} r={Math.max(1.5, m.pupil * 0.11)} fill="#fff" opacity={m.eyeH > 40 ? 1 : 0} />
            </g>
          );
        })}
        <g transform={`translate(187.5 ${m.mouthY}) rotate(${m.mouthRot})`} filter="url(#mood-lip)">
          <rect x={-m.mouthW / 2} y={-m.mouthH / 2} width={m.mouthW} height={m.mouthH} rx={Math.min(14, m.mouthH / 2.2)} fill="#1a0e13" stroke="#f6e3d2" strokeWidth="7" />
          <rect x={-m.mouthW * 0.28} y={m.mouthH * 0.12} width={m.mouthW * 0.56} height={Math.max(2, m.mouthH * 0.2)} rx="6" fill="#ee2f6e" opacity={m.tongue} />
          {[-1.5, -0.5, 0.5, 1.5].map((k) => (
            <circle key={k} cx={k * m.mouthW * 0.15} cy="0" r={Math.max(1.5, m.mouthH * 0.06)} fill="#fff" opacity={m.teeth} />
          ))}
        </g>
      </svg>

      {problem && <div className="absolute left-0 right-0 text-center text-[12px] font-semibold text-white/90 pointer-events-none" style={{ bottom: `calc(${PANEL_H + 18}px + env(safe-area-inset-bottom))` }} role="status">{problem}</div>}

      {/* the ruler */}
      <div className="absolute left-0 right-0 bottom-0 bg-white" style={{ height: `calc(${PANEL_H}px + env(safe-area-inset-bottom))`, borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0 -8px 30px rgba(0,0,0,.12)' }}>
        <div className="absolute rounded-full bg-white" style={{ width: 96, height: 96, left: knobX - 48, top: -34 }} />
        <div className="absolute rounded-full" style={{ width: 54, height: 54, left: knobX - 27, top: -13, background: m.color, boxShadow: 'inset 0 -3px 6px rgba(0,0,0,.08)' }} data-testid="mood-knob" />
        <div className="absolute left-0 right-0" style={{ top: 78, height: 44 }}>
          {MOODS.map((mm, i) => {
            const x = PAD + (i / last) * trackW;
            const on = i === idx;
            const dotX = PAD + ((i + 0.5) / last) * trackW;
            return (
              <React.Fragment key={mm.id}>
                <span className="absolute rounded-full" style={{ left: x - 2.5, top: on ? 2 : 8, width: 5, height: on ? 40 : 28, background: on ? '#1b1b1b' : '#dcdcdc', transition: 'height .2s, top .2s, background .2s' }} />
                {i < last && <span className="absolute rounded-full" style={{ left: dotX - 1.5, top: 20, width: 3, height: 3, background: '#e4e4e4' }} />}
              </React.Fragment>
            );
          })}
        </div>

        {/* the Save mood button, and when it clears */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => { void save(); }}
          disabled={saveState === 'saving' || saveState === 'saved' || (!!currentUser && pickedId !== null && pickedId === savedId)}
          data-testid="mood-save"
          className="absolute left-5 right-5 flex items-center justify-center gap-2 rounded-full text-white font-extrabold text-[16px] cursor-pointer transition-transform active:scale-[.98]"
          style={{ top: 140, height: 56, background: saveState === 'saved' ? '#16a34a' : '#0b0b0c', boxShadow: '0 16px 28px -16px rgba(0,0,0,.6)' }}
        >
          {saveState === 'saving' ? <><Loader2 className="w-5 h-5 animate-spin" />Saving…</> : (saveState === 'saved' || (pickedId !== null && pickedId === savedId)) ? <><Check className="w-5 h-5" strokeWidth={3} />Saved</> : 'Save mood'}
        </button>
        <p className="absolute left-0 right-0 text-center text-[12px] font-medium text-zinc-500" style={{ top: 206 }}>Your mood clears by itself at 12 midnight.</p>
      </div>
    </div>
  );
};

export default MoodPage;
