import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Copy, Download, FilePlus2, Minus, NotebookPen, Plus, Redo2, Search, Trash2, Undo2 } from 'lucide-react';
import { PageShell, Section, Empty, PageLoading, Note as Hint, SmallButton, useFlash } from '../kit';
import type { PageProps } from '../types';
import { NOTE_MAX_CHARS, createNote, deleteNote, filterNotes, listNotes, noteStats, noteTitle, saveNote, type Note } from '../../../services/notesApi';

// The Notepad: a plain text notepad that keeps what you write and paste (text only), on your account, so it is there on every device you log in on.
// A list of notes (newest first, with a search box) and an editor that saves by itself a moment after you stop typing.

const SIZES = [13, 15, 17, 20];
const when = (iso: string): string => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export const NotepadPage: React.FC<PageProps> = ({ back }) => {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved');
  const [size, setSize] = useState<number>(() => { try { return Number(localStorage.getItem('noob_notepad_size')) || 15; } catch { return 15; } });
  const [flash, say] = useFlash();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ id: null as string | null, draft: '' });
  latest.current = { id: openId, draft };

  const load = useCallback(async () => {
    try { setNotes(await listNotes()); setError(''); }
    catch (e) { setNotes([]); setError(/relation|does not exist|schema cache/i.test(String((e as Error).message)) ? 'The Notepad is not switched on yet. Try again in a little while.' : 'Could not load your notes. Check your connection and try again.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    const { id, draft: text } = latest.current;
    if (!id) return;
    setState('saving');
    try {
      const at = await saveNote(id, text);
      setNotes((list) => (list ? [{ ...(list.find((n) => n.id === id) as Note), body: text, updatedAt: at }, ...list.filter((n) => n.id !== id)] : list));
      setState((s) => (latest.current.draft === text ? 'saved' : s));
    } catch { setState('failed'); }
  }, []);
  useEffect(() => () => { window.clearTimeout(timer.current); }, []);

  const change = (text: string) => {
    setDraft(text.slice(0, NOTE_MAX_CHARS));
    setState('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 700);
  };
  const open = (n: Note) => { setOpenId(n.id); setDraft(n.body); setState('saved'); };
  const newNote = async () => {
    try { const n = await createNote(''); setNotes((l) => [n, ...(l || [])]); open(n); setTimeout(() => areaRef.current?.focus(), 50); }
    catch (e) { say(String((e as Error).message || 'Could not make a new note.'), 'bad'); }
  };
  const close = async () => {
    await flush();
    const { id, draft: text } = latest.current;
    if (id && !text.trim()) { try { await deleteNote(id); setNotes((l) => (l || []).filter((n) => n.id !== id)); } catch { /* an empty note is harmless */ } }
    setOpenId(null);
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this note for good?')) return;
    try { await deleteNote(id); setNotes((l) => (l || []).filter((n) => n.id !== id)); if (openId === id) setOpenId(null); say('Note deleted.', 'good'); }
    catch { say('Could not delete the note.', 'bad'); }
  };
  const resize = (d: number) => { const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + d)); setSize(SIZES[i]); try { localStorage.setItem('noob_notepad_size', String(SIZES[i])); } catch { /* not remembered */ } };
  const copyAll = async () => { try { await navigator.clipboard.writeText(draft); say('Copied.', 'good'); } catch { areaRef.current?.select(); say('Press Ctrl+C (or Copy on your phone) to copy.', 'info'); } };
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) { say('Nothing to paste: the clipboard is empty.', 'info'); return; }
      const el = areaRef.current; const a = el?.selectionStart ?? draft.length; const b = el?.selectionEnd ?? draft.length;
      change(draft.slice(0, a) + t + draft.slice(b));
    } catch { areaRef.current?.focus(); say('Your browser did not allow it: press and hold in the note, then Paste.', 'info'); }
  };
  const edit = (cmd: 'undo' | 'redo') => { areaRef.current?.focus(); try { document.execCommand(cmd); } catch { /* the keyboard shortcut still works */ } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${noteTitle(draft).replace(/[^\w -]+/g, '').trim() || 'note'}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const shown = useMemo(() => filterNotes(notes || [], query), [notes, query]);
  const stats = noteStats(draft);

  if (openId) {
    return (
      <PageShell title="Notepad" onBack={() => { void close(); }} subtitle={state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'failed' ? 'Not saved: check your connection' : 'Typing…'}
        right={<SmallButton onClick={() => remove(openId)} tone="danger" testId="note-delete"><Trash2 className="w-3.5 h-3.5" /></SmallButton>}>
        <div className="pt-3 space-y-2">
          {flash}
          <div className="flex flex-wrap items-center gap-1.5" data-testid="note-toolbar">
            {[
              { icon: Undo2, label: 'Undo', run: () => edit('undo') }, { icon: Redo2, label: 'Redo', run: () => edit('redo') },
              { icon: ClipboardPaste, label: 'Paste', run: paste }, { icon: Copy, label: 'Copy all', run: copyAll }, { icon: Download, label: 'Save as .txt', run: download },
              { icon: Minus, label: 'Smaller text', run: () => resize(-1) }, { icon: Plus, label: 'Bigger text', run: () => resize(1) }
            ].map(({ icon: Icon, label, run }) => (
              <button key={label} type="button" onClick={() => { void run(); }} aria-label={label} title={label}
                className="h-9 px-2.5 rounded-full border border-white/15 bg-zinc-900/80 hover:border-white/40 text-zinc-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <Icon className="w-4 h-4" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <textarea ref={areaRef} value={draft} onChange={(e) => change(e.target.value)} onBlur={() => { void flush(); }} placeholder="Write or paste here…" spellCheck data-testid="note-text"
            style={{ fontSize: size }} className="w-full min-h-[55vh] rounded-2xl bg-zinc-950 border border-white/10 focus:border-white/40 outline-none p-3.5 text-white leading-relaxed resize-y" />
          <p className="text-[11px] text-zinc-500" data-testid="note-stats">{stats.words} words · {stats.chars.toLocaleString()} characters · {stats.lines} lines · text only, up to {NOTE_MAX_CHARS.toLocaleString()} characters</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Notepad" onBack={back} subtitle="Write and paste notes. They stay on your account." right={<SmallButton onClick={newNote} tone="solid" testId="note-new"><FilePlus2 className="w-3.5 h-3.5" />New</SmallButton>}>
      <div className="pt-3 space-y-3">
        {flash}
        {notes === null ? <PageLoading /> : (
          <>
            {error && <Hint tone="bad">{error}</Hint>}
            {notes.length > 0 && (
              <label className="flex items-center gap-2 h-11 px-3.5 rounded-full bg-zinc-900/80 border border-white/10 focus-within:border-white/40">
                <Search className="w-4 h-4 text-zinc-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500" data-testid="note-search" />
              </label>
            )}
            {!error && notes.length === 0 && <Empty icon={NotebookPen} title="No notes yet" text="Tap New to write one, or paste something you want to keep. Only text is saved." />}
            {notes.length > 0 && shown.length === 0 && <Empty icon={Search} title="Nothing found" text="No note has that in it." />}
            {shown.length > 0 && (
              <Section>
                {shown.map((n) => (
                  <div key={n.id} className="flex items-stretch border-b border-white/5 last:border-0">
                    <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-white/5 cursor-pointer" data-testid="note-row">
                      <span className="block text-sm font-bold text-white truncate">{noteTitle(n.body)}</span>
                      <span className="block text-xs text-zinc-400 truncate">{n.body.trim().split(/\r?\n/).slice(1).join(' ').slice(0, 90) || 'No more text'}</span>
                      <span className="block text-[10px] text-zinc-500 mt-0.5">{when(n.updatedAt)}</span>
                    </button>
                    <button type="button" onClick={() => remove(n.id)} aria-label="Delete note" className="px-3.5 text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
};
