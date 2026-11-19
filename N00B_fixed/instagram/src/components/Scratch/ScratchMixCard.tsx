import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchUserById } from '../../services/supabaseApi';
import type { User } from '../../types';
import { ScratchCardView } from './ScratchCard';
import { ScratchNotes } from './ScratchNotes';
import type { ScratchCard } from './scratchData';
import { SCRATCH_TOOLS } from './scratchEngine';

// A scratch card as it appears on Home, shuffled in between the posts (it used to have a page of its own). Same card, same server calls (reactions, notes, save, delete).
const TOOL_KEY = 'noob_scratch_tool';
const SOUND_KEY = 'noob_scratch_sound';
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };

export const ScratchMixCard: React.FC<{ initial: ScratchCard; onRemoved: () => void; onOpenProfile?: (u: User) => void }> = ({ initial, onRemoved, onOpenProfile }) => {
  const [card, setCard] = useState(initial);
  const [notes, setNotes] = useState<ScratchCard | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stored = read(TOOL_KEY);
  const tool = (stored && SCRATCH_TOOLS[stored]) || SCRATCH_TOOLS.coin;
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const say = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    setToast({ text, tone });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const change = useCallback((next: ScratchCard) => { setCard(next); setNotes((n) => (n && n.id === next.id ? next : n)); }, []);
  const openProfile = async (userId: string) => {
    if (!onOpenProfile) return;
    const u = await fetchUserById(userId);
    if (u) onOpenProfile(u); else say('That profile could not be opened.', 'bad');
  };

  return (
    <div className="-mb-4" data-testid="home-scratch-card">
      <ScratchCardView card={card} tool={tool} brushMultiplier={1} soundEnabled={read(SOUND_KEY) !== 'off'} onChange={change}
        onDeleted={() => onRemoved()} onOpenNotes={setNotes} onOpenProfile={openProfile} say={say} />
      {toast && (
        <div role="status" className={`fixed left-1/2 -translate-x-1/2 bottom-[max(5rem,env(safe-area-inset-bottom))] z-[300] px-4 py-2.5 rounded-full text-xs font-black shadow-2xl ring-1 max-w-[90vw] text-center ${toast.tone === 'good' ? 'bg-emerald-400 text-black ring-emerald-100/60' : 'bg-red-500 text-white ring-red-200/50'}`}>{toast.text}</div>
      )}
      {notes && <ScratchNotes card={notes} onClose={() => setNotes(null)} onCard={change} />}
    </div>
  );
};
