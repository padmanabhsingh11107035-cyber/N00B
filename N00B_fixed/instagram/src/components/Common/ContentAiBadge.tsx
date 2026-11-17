import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { fetchContentAiLabels } from '../../services/supabaseApi';

// The "AI info" label on a REEL or a STORY (posts have their own in PostCard). The label lives in its own table (migration 20261118000002), so the app asks for it by ids:
// every badge that appears within a moment is answered by ONE request, and each answer is remembered, so scrolling back never asks again.
type Kind = 'reel' | 'story';
type Source = 'creator' | 'detected';
const known = new Map<string, Source | 'none'>();
const waiting: Record<Kind, Set<string>> = { reel: new Set(), story: new Set() };
const listeners = new Map<string, Set<() => void>>();
let timer: number | null = null;

const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;
const notify = (k: string) => listeners.get(k)?.forEach((f) => f());

function flush(): void {
  timer = null;
  (['reel', 'story'] as Kind[]).forEach((kind) => {
    const ids = Array.from(waiting[kind]); waiting[kind].clear();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      void fetchContentAiLabels(kind, part).then((found) => {
        part.forEach((id) => { known.set(keyOf(kind, id), found[id] || 'none'); notify(keyOf(kind, id)); });
      });
    }
  });
}
function want(kind: Kind, id: string): void {
  if (known.has(keyOf(kind, id))) return;
  known.set(keyOf(kind, id), 'none');   // placeholder until the answer arrives (a failed request keeps "no label", never an error on screen)
  waiting[kind].add(id);
  if (timer == null) timer = window.setTimeout(flush, 40);
}

/** Why this reel / story carries the label, or null when it has none (or the answer has not arrived yet). */
export function useContentAiLabel(kind: Kind, id: string | undefined): Source | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id) return;
    const k = keyOf(kind, id);
    const f = () => tick((n) => n + 1);
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k)!.add(f);
    want(kind, id);
    return () => { listeners.get(k)?.delete(f); };
  }, [kind, id]);
  if (!id) return null;
  const v = known.get(keyOf(kind, id));
  return v === 'creator' || v === 'detected' ? v : null;
}

/** Makes a just-published reel / story show its label at once (the person who made it does not wait for a request). */
export function rememberContentAiLabel(kind: Kind, id: string, source: Source): void {
  known.set(keyOf(kind, id), source);
  notify(keyOf(kind, id));
}

/** The small "AI info" pill; a tap says why. Draws nothing when there is no label. */
export const ContentAiBadge: React.FC<{ kind: Kind; id: string | undefined; className?: string }> = ({ kind, id, className = '' }) => {
  const source = useContentAiLabel(kind, id);
  const [open, setOpen] = useState(false);
  if (!source) return null;
  const what = kind === 'reel' ? 'reel' : 'story';
  return (
    <div className={className} data-testid={`${kind}-ai-info`} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-expanded={open} className="bg-black/70 backdrop-blur-md border border-purple-500/40 rounded-full px-2.5 py-1 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer">
        <Sparkles className="w-3 h-3 text-purple-300" aria-hidden="true" /> AI info
      </button>
      {open && (
        <div role="status" className="mt-1.5 max-w-[240px] rounded-2xl bg-black/85 backdrop-blur-md border border-white/15 px-3 py-2 text-[12px] leading-snug text-zinc-100 shadow-xl" data-testid={`${kind}-ai-info-text`}>
          <strong className="block text-white mb-0.5">Made with AI</strong>
          {source === 'detected' ? `NOOB found a marker inside this file that says it was made or changed with AI.` : `The person who shared this ${what} says it was made or changed with AI.`}
        </div>
      )}
    </div>
  );
};
