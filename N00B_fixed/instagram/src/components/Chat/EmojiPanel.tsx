import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { EmojiData, EmojiEntry, TONES, emojiInGroup, pushRecent, searchEmoji, withTone } from './emojiLogic';

const RECENT_KEY = 'noob_recent_emoji_v1';
const TONE_KEY = 'noob_emoji_tone_v1';
const GROUP_ICONS = ['😀', '👋', '🐶', '🍔', '✈️', '⚽', '💡', '🔣', '🏳️'];

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: the choice just is not remembered */ }
};

// Emoji added to Unicode recently may be missing from an older phone's emoji font (it would show an empty box). Draw it and compare
// with a box: if it looks the same, this phone can not show it, so it is left out of the list.
let boxWidth: number | null = null;
const canShow = (() => {
  const cache = new Map<string, boolean>();
  return (emoji: string): boolean => {
    if (cache.has(emoji)) return cache.get(emoji)!;
    let ok = true;
    try {
      const c = document.createElement('canvas').getContext('2d');
      if (c) {
        c.font = '32px sans-serif';
        boxWidth ??= c.measureText('￿').width;
        const w = c.measureText(emoji).width;
        // an emoji this phone lacks is drawn as a box, or as two or more separate pieces (a joined emoji that fell apart)
        ok = w > 0 && Math.abs(w - boxWidth) > 0.5 && w < 32 * 1.6;
      }
    } catch { /* no canvas: show everything */ }
    cache.set(emoji, ok);
    return ok;
  };
})();

interface EmojiPanelProps {
  onPick: (emoji: string) => void;
}

// Every emoji, in groups, with search, skin tones and "recently used". The emoji list is loaded the first time this opens.
export const EmojiPanel: React.FC<EmojiPanelProps> = ({ onPick }) => {
  const [data, setData] = useState<EmojiData | null>(null);
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState<number>(() => read(TONE_KEY, 0));
  const [recent, setRecent] = useState<string[]>(() => read(RECENT_KEY, []));
  const [showTones, setShowTones] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    import('../../data/emojiData.json').then((m: any) => alive && setData((m.default ?? m) as EmojiData));
    return () => { alive = false; };
  }, []);

  const shown = (list: EmojiEntry[]) => list.filter((e) => e[4] < 13 || canShow(e[0]));

  const pick = (emoji: string) => {
    const next = pushRecent(recent, emoji);
    setRecent(next);
    write(RECENT_KEY, next);
    onPick(emoji);
  };
  const chooseTone = (t: number) => {
    setTone(t);
    write(TONE_KEY, t);
    setShowTones(false);
  };

  const results = useMemo(() => (data && query.trim() ? shown(searchEmoji(data, query)) : []), [data, query]);

  if (!data) return <p className="text-center text-[11px] text-zinc-500 py-8">Loading emoji…</p>;

  const grid = (list: EmojiEntry[]) => (
    <div className="grid grid-cols-8 gap-0.5 text-[22px]">
      {list.map((e) => {
        const ch = withTone(e, tone);
        return (
          <button key={e[0]} type="button" onClick={() => pick(ch)} title={e[1]} aria-label={e[1]} className="h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center cursor-pointer active:scale-110 transition-transform" translate="no">
            {ch}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji"
            className="w-full bg-zinc-900 text-xs text-white pl-8 pr-2 py-2 rounded-xl border border-zinc-800 focus:border-[#00FF66] outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowTones((v) => !v)} className="h-8 px-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-base cursor-pointer" title="Skin tone" aria-label="Skin tone" translate="no">
            {'👋' + TONES[tone]}
          </button>
          {showTones && (
            <div className="absolute right-0 top-9 z-10 flex gap-1 bg-zinc-950 border border-zinc-700 rounded-xl p-1.5 shadow-xl">
              {TONES.map((t, i) => (
                <button key={i} type="button" onClick={() => chooseTone(i)} className={`w-7 h-7 rounded-lg text-base cursor-pointer hover:bg-zinc-800 ${tone === i ? 'bg-zinc-800 ring-1 ring-[#00FF66]' : ''}`} translate="no">
                  {'👋' + t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {query.trim() ? (
        results.length ? grid(results) : <p className="text-center text-[11px] text-zinc-500 py-8">No emoji found.</p>
      ) : (
        <>
          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {recent.length > 0 && (
              <button type="button" onClick={() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="px-2 py-1 rounded-lg hover:bg-zinc-800 text-base cursor-pointer" title="Recently used" aria-label="Recently used">🕒</button>
            )}
            {data.groups.map((g, i) => (
              <button key={g} type="button" onClick={() => sections.current[i]?.scrollIntoView({ block: 'start', behavior: 'smooth' })} className="px-2 py-1 rounded-lg hover:bg-zinc-800 text-base cursor-pointer" title={g} aria-label={g} translate="no">
                {GROUP_ICONS[i]}
              </button>
            ))}
          </div>
          <div ref={scroller} className="max-h-60 overflow-y-auto pr-1 space-y-3">
            {recent.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Recently used</span>
                <div className="grid grid-cols-8 gap-0.5 text-[22px]">
                  {recent.map((r) => (
                    <button key={r} type="button" onClick={() => pick(r)} className="h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center cursor-pointer" translate="no">{r}</button>
                  ))}
                </div>
              </div>
            )}
            {data.groups.map((g, i) => (
              <div key={g} ref={(el) => { sections.current[i] = el; }} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 200px' }}>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">{g}</span>
                {grid(shown(emojiInGroup(data, i)))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
