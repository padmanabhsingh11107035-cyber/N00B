import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { searchGifs, type GifItem } from '../../services/api';
import { StickerEntry, searchStickers, stickerCategories, stickerPreviewUrl, stickerUrl } from './emojiLogic';

const PAGE = 48;

interface AnimatedStickerPanelProps {
  // gets the address of the moving picture to send
  onPick: (url: string) => void;
}

// Hundreds of animated emoji stickers (Google's Noto Emoji Animation, free to use with credit). The grid shows light still pictures;
// the moving picture is only fetched by the people who receive the sticker.
export const AnimatedStickerPanel: React.FC<AnimatedStickerPanelProps> = ({ onPick }) => {
  const [list, setList] = useState<StickerEntry[] | null>(null);
  const [credit, setCredit] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    import('../../data/stickerData.json').then((m: any) => {
      const d = m.default ?? m;
      if (alive) { setList(d.stickers as StickerEntry[]); setCredit(d.credit); }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => setLimit(PAGE), [query, category]);
  const categories = useMemo(() => (list ? stickerCategories(list) : []), [list]);
  const found = useMemo(() => (list ? searchStickers(list, query, category) : []), [list, query, category]);

  if (!list) return <p className="text-center text-[11px] text-zinc-500 py-6">Loading stickers…</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Animated stickers ({list.length})</span>
      </div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stickers" className="w-full bg-zinc-900 text-xs text-white pl-8 pr-2 py-2 rounded-xl border border-zinc-800 focus:border-[#00FF66] outline-none placeholder:text-zinc-600" />
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {[null, ...categories].map((c) => (
          <button key={c ?? 'all'} type="button" onClick={() => setCategory(c)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap cursor-pointer border ${category === c ? 'border-[#00FF66] text-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
            {c ?? 'All'}
          </button>
        ))}
      </div>
      {found.length === 0 ? (
        <p className="text-center text-[11px] text-zinc-500 py-6">No stickers found.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {found.slice(0, limit).map((s) => (
            <button key={s[0]} type="button" onClick={() => onPick(stickerUrl(s[0]))} title={s[2]} aria-label={s[2] || 'Sticker'} className="aspect-square rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#00FF66]/50 flex items-center justify-center p-1.5 cursor-pointer transition-all">
              <img src={stickerPreviewUrl(s[0])} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-full max-h-full object-contain" />
            </button>
          ))}
        </div>
      )}
      {found.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full py-2 rounded-xl border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:border-zinc-600 cursor-pointer">
          Show more
        </button>
      )}
      <p className="text-[9px] text-zinc-600 text-center">{credit}</p>
    </div>
  );
};

interface GifPanelProps {
  // the built-in set, shown first and when the online search is not switched on
  curated: GifItem[];
  onPick: (url: string) => void;
}

// GIFs: the built-in set, plus (when the online GIF library is switched on for the app) a search of it. The search runs on our
// server, so the library's key is never in the app.
export const GifPanel: React.FC<GifPanelProps> = ({ curated, onPick }) => {
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<GifItem[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      setLoading(true);
      const res = await searchGifs(query.trim());
      if (!alive) return;
      setConfigured(res.configured);
      setOnline(res.configured ? res.gifs : null);
      setLoading(false);
    }, query.trim() ? 450 : 0);
    return () => { alive = false; window.clearTimeout(t); };
  }, [query]);

  const q = query.trim().toLowerCase();
  const builtIn = q ? curated.filter((g) => g.title.toLowerCase().includes(q)) : curated;
  const list = configured && online ? (q ? online : [...online, ...builtIn]) : builtIn;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search GIFs" className="w-full bg-zinc-900 text-xs text-white pl-8 pr-2 py-2 rounded-xl border border-zinc-800 focus:border-[#00FF66] outline-none placeholder:text-zinc-600" />
      </div>
      {list.length === 0 ? (
        <p className="text-center text-[11px] text-zinc-500 py-6">{loading ? 'Searching…' : configured === false && q ? 'No GIF with that name in the built-in set.' : 'No GIFs found.'}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {list.map((gif) => (
            <button key={gif.id} type="button" onClick={() => onPick(gif.url)} className="group relative rounded-xl overflow-hidden border border-zinc-800 hover:border-[#00FF66] transition-all cursor-pointer text-left">
              <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" className="w-full h-20 object-cover group-hover:scale-105 transition-transform" />
              <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] font-bold text-white py-0.5 px-1 truncate">{gif.title}</span>
            </button>
          ))}
        </div>
      )}
      {loading && list.length > 0 && <p className="text-center text-[10px] text-zinc-600">Searching…</p>}
    </div>
  );
};
