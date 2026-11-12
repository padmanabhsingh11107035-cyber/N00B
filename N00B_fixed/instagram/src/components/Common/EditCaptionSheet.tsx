import React, { useEffect, useRef, useState } from 'react';
import { CAPTION_MAX, extractHashtags } from '../../utils/hashtags';

// A small bottom sheet to change the caption of your own post or reel after it was published. The hashtags follow the new caption (the server does that).
// `onSave` returns an error text, or nothing when it worked (the sheet then closes itself through `onClose`).
interface Props {
  title?: string;
  initial: string;
  onSave: (caption: string) => Promise<string | void | null>;
  onClose: () => void;
}

export const EditCaptionSheet: React.FC<Props> = ({ title = 'Edit caption', initial, onSave, onClose }) => {
  const [text, setText] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, []);
  const changed = text !== (initial || '');
  const tags = extractHashtags(text);

  const save = async () => {
    if (busy || !changed) return;
    setBusy(true); setError('');
    let err: string | void | null = null;
    try { err = await onSave(text); } catch (e) { err = e instanceof Error && e.message ? e.message : 'The caption could not be saved.'; }
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div data-noob-sheet="1" className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60" onClick={() => { if (!busy) onClose(); }} data-testid="edit-caption-sheet">
      <div
        role="dialog" aria-label={title}
        className="w-full max-w-lg rounded-t-3xl bg-zinc-950 border border-white/10 p-4 text-zinc-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
        <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, CAPTION_MAX))}
          maxLength={CAPTION_MAX}
          rows={5}
          aria-label="Caption"
          placeholder="Write a caption... use #hashtags"
          className="w-full resize-none rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm text-white outline-none focus:border-zinc-500"
          data-testid="edit-caption-input"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
          <span className="truncate pr-2">{tags.length > 0 ? tags.slice(0, 6).join(' ') + (tags.length > 6 ? ` +${tags.length - 6}` : '') : 'No hashtags in this caption'}</span>
          <span data-testid="edit-caption-count" className="shrink-0">{text.length}/{CAPTION_MAX}</span>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-400" data-testid="edit-caption-error">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 cursor-pointer disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !changed} className="flex-1 rounded-xl bg-[#0C831F] py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50" data-testid="edit-caption-save">{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};
