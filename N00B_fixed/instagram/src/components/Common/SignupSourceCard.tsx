import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { SOURCE_OPTIONS, clearAskSource, cleanSource, shouldAskSource } from '../../utils/signupSource';

// A small square card with round corners, shown once right after an account is made: "Where did you hear about NOOB?" with a list of places. Skipping is allowed.
// The answer is saved in signup_sources (one row per person, migration 20261027000005); if saving fails nothing is shown to the person and they are not asked again.
export const SignupSourceCard: React.FC<{ userId: string }> = ({ userId }) => {
  const [open, setOpen] = useState(() => shouldAskSource(userId));
  const [other, setOther] = useState(false);
  const [text, setText] = useState('');
  if (!open) return null;

  const finish = (source?: string, detail?: string) => {
    clearAskSource();
    setOpen(false);
    if (source) void Promise.resolve(supabase.from('signup_sources').insert({ source: cleanSource(source), detail: detail?.trim().slice(0, 200) || null })).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Where did you hear about NOOB?" data-testid="signup-source">
      <div className="w-[min(92vw,360px)] max-h-[88vh] overflow-y-auto rounded-[28px] bg-zinc-950 border border-white/15 ring-1 ring-white/5 shadow-2xl shadow-black p-5 text-white">
        <p className="text-xl font-black tracking-tight">Welcome to NOOB! 🎉</p>
        <p className="text-sm text-zinc-300 mt-1">Where did you hear about us? It helps us a lot.</p>
        {!other ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {SOURCE_OPTIONS.map((o) => (
              <button key={o.id} type="button" data-testid={`source-${o.id}`} onClick={() => (o.id === 'other' ? setOther(true) : finish(o.id))}
                className="px-3 py-2.5 rounded-2xl bg-zinc-900 border border-white/10 hover:border-white/50 text-left text-xs font-bold flex items-center gap-2 cursor-pointer">
                <span aria-hidden="true" className="text-base">{o.emoji}</span><span className="leading-tight">{o.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Where? (optional)" className="w-full h-11 rounded-2xl bg-zinc-900 border border-white/15 focus:border-white/50 outline-none px-3.5 text-sm" data-testid="source-other-text" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setOther(false)} className="flex-1 py-2.5 rounded-full border border-white/20 text-sm font-bold cursor-pointer">Back</button>
              <button type="button" onClick={() => finish('other', text)} className="flex-1 py-2.5 rounded-full bg-white text-black text-sm font-extrabold cursor-pointer" data-testid="source-other-send">Done</button>
            </div>
          </div>
        )}
        <button type="button" onClick={() => finish()} className="mt-4 w-full text-center text-xs font-bold text-zinc-400 hover:text-white cursor-pointer" data-testid="source-skip">Skip</button>
      </div>
    </div>
  );
};
