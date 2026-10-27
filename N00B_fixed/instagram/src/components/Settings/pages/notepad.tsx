import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bold, ChevronLeft, CheckSquare, Copy, Download, Italic, List, ListOrdered, Mic, MoreVertical, NotebookPen, Plus, Redo2, Save, Search, Share2, Trash2, Type, Underline as UnderlineIcon, Undo2 } from 'lucide-react';
import { useFlash } from '../kit';
import type { PageProps } from '../types';
import { NOTE_MAX_CHARS, createNote, deleteNote, filterNotes, listNotes, noteStats, noteTitle, saveNote, type Note } from '../../../services/notesApi';
import { continueList, joinNote, splitNote, styleSelection, toggleList, type Edit, type ListKind } from '../../../utils/notepadFormat';
import { canRecognize, listen, type Listener } from '../../../utils/studyVoice';

// The Notepad: plain text notes (what you write and paste, kept on your account, so they are on every device you log in on). A list of notes, and an editor with a title, the text, and a
// floating bar for Bold / Italic / Underline (special letters, still plain text), check boxes, bullets, numbers and speaking instead of typing. It saves by itself a moment after you
// stop typing. Everything you do shows at once: a new note opens before the server has answered, and a deleted one is gone from the list straight away.

const SIZES = [14, 16, 18, 21];
const when = (iso: string): string => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const isTemp = (id: string | null): boolean => !!id && id.startsWith('tmp-');
const round = 'w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0';

export const NotepadPage: React.FC<PageProps> = ({ back }) => {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved');
  const [menu, setMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const [size, setSize] = useState<number>(() => { try { return Number(localStorage.getItem('noob_notepad_size')) || 16; } catch { return 16; } });
  const [flash, say] = useFlash();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const making = useRef<Map<string, Promise<string>>>(new Map());
  const listener = useRef<Listener | null>(null);
  const latest = useRef({ id: null as string | null, text: '' });
  latest.current = { id: openId, text: joinNote(title, body) };

  const load = useCallback(async () => {
    try { setNotes(await listNotes()); setError(''); }
    catch (e) { setNotes([]); setError(/relation|does not exist|schema cache/i.test(String((e as Error).message)) ? 'The Notepad is not switched on yet. Try again in a little while.' : 'Could not load your notes. Check your connection and try again.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { window.clearTimeout(timer.current); listener.current?.stop(); }, []);

  const realId = async (id: string): Promise<string> => (isTemp(id) ? (making.current.get(id) ?? Promise.reject(new Error('gone'))) : id);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    const { id, text } = latest.current;
    if (!id) return;
    setState('saving');
    try {
      const real = await realId(id);
      const at = await saveNote(real, text);
      setNotes((list) => (list ? list.map((n) => (n.id === id || n.id === real ? { ...n, id: real, body: text, updatedAt: at } : n)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)) : list));
      setState((s) => (latest.current.text === text ? 'saved' : s));
    } catch { setState('failed'); }
  }, []);

  const touch = () => {
    setState('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 700);
  };
  const changeTitle = (t: string) => { setTitle(t.replace(/\n/g, ' ').slice(0, 120)); touch(); };
  const changeBody = (t: string) => { setBody(t.slice(0, NOTE_MAX_CHARS - 130)); touch(); };

  const open = (n: Note) => { const s = splitNote(n.body); setTitle(s.title); setBody(s.body); setOpenId(n.id); setState('saved'); setMenu(false); };

  // a new note opens at once; the server is told in the background (and what was typed meanwhile is saved when its answer comes)
  const newNote = () => {
    const tmp = 'tmp-' + Math.random().toString(36).slice(2, 10);
    const now = new Date().toISOString();
    const local: Note = { id: tmp, body: '', createdAt: now, updatedAt: now };
    setNotes((l) => [local, ...(l || [])]);
    open(local);
    window.setTimeout(() => areaRef.current?.focus(), 60);
    const p = createNote('').then((n) => {
      setNotes((l) => (l || []).map((x) => (x.id === tmp ? { ...x, id: n.id } : x)));
      setOpenId((cur) => (cur === tmp ? n.id : cur));
      if (latest.current.id === tmp) latest.current.id = n.id;
      return n.id;
    });
    making.current.set(tmp, p);
    p.catch(() => {
      setNotes((l) => (l || []).filter((x) => x.id !== tmp));
      setOpenId((cur) => (cur === tmp ? null : cur));
      say('Could not make a new note. Check your connection.', 'bad');
    });
  };

  const close = async () => {
    listener.current?.stop();
    const { id, text } = latest.current;
    if (id && !text.trim()) {   // an empty note is not kept
      setOpenId(null); setNotes((l) => (l || []).filter((n) => n.id !== id));
      try { await deleteNote(await realId(id)); } catch { /* it was empty anyway */ }
      return;
    }
    setOpenId(null);
    await flush();
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this note for good?')) return;
    const before = notes || [];
    setNotes(before.filter((n) => n.id !== id)); if (openId === id) setOpenId(null); setMenu(false);   // gone at once
    try { await deleteNote(await realId(id)); say('Note deleted.', 'good'); }
    catch { setNotes(before); say('Could not delete the note. It was put back.', 'bad'); }
  };

  // ---- the floating bar
  const apply = (fn: (text: string, a: number, b: number) => Edit) => {
    const el = areaRef.current; if (!el) return;
    const e = fn(body, el.selectionStart, el.selectionEnd);
    changeBody(e.text);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(e.start, e.end); });
  };
  const list = (kind: ListKind) => apply((t, a, b) => toggleList(t, a, b, kind));
  const style = (k: 'bold' | 'italic' | 'underline') => {
    const el = areaRef.current;
    if (el && el.selectionStart === el.selectionEnd) { say('Select some text first, then press this.', 'info'); el.focus(); return; }
    apply((t, a, b) => styleSelection(t, a, b, k));
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const next = continueList(body, el.selectionStart);
    if (!next) return;
    e.preventDefault();
    changeBody(next.text);
    requestAnimationFrame(() => el.setSelectionRange(next.start, next.end));
  };
  const edit = (cmd: 'undo' | 'redo') => { areaRef.current?.focus(); try { document.execCommand(cmd); } catch { /* the keyboard shortcut still works */ } };
  const speak = () => {
    if (listening) { listener.current?.stop(); return; }
    if (!canRecognize()) { say('Speaking is not available in this browser. You can still type.', 'info'); return; }
    const base = body;
    setListening(true);
    listener.current = listen('en-IN', {
      onText: (t) => changeBody(base + (base && !/\s$/.test(base) ? ' ' : '') + t),
      onEnd: () => setListening(false),
      onError: (c) => { setListening(false); if (c !== 'aborted' && c !== 'no-speech') say('The microphone did not work. Check that NOOB may use it.', 'bad'); }
    });
  };

  // ---- the top bar
  const resize = (d: number) => { const i = Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + d)); setSize(SIZES[i]); try { localStorage.setItem('noob_notepad_size', String(SIZES[i])); } catch { /* not remembered */ } };
  const full = () => joinNote(title, body);
  const copyAll = async () => { setMenu(false); try { await navigator.clipboard.writeText(full()); say('Copied.', 'good'); } catch { say('Select the text and copy it with your keyboard.', 'info'); } };
  const share = async () => {
    const text = full();
    try { if (navigator.share) { await navigator.share({ title: title || 'Note', text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); say('Copied, ready to paste anywhere.', 'good'); } catch { say('Sharing is not available here.', 'info'); }
  };
  const download = () => {
    setMenu(false);
    const url = URL.createObjectURL(new Blob([full()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${noteTitle(full()).replace(/[^\w -]+/g, '').trim() || 'note'}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const saveNow = async () => { await flush(); say('Saved.', 'good'); };

  const shown = useMemo(() => filterNotes(notes || [], query), [notes, query]);
  const stats = noteStats(full());
  const shell = 'min-h-full bg-gradient-to-b from-[#0b4a37] via-[#093a2c] to-[#06261c] text-white';

  if (openId) {
    return (
      <div className={shell} data-testid="notepad-editor">
        <div className="max-w-2xl mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
          <header className="flex items-center gap-2.5 mb-3.5">
            <button type="button" onClick={close} aria-label="Back" data-testid="settings-back" className={round}><ChevronLeft className="w-6 h-6" /></button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight leading-none">Notepad</h1>
              <p className="text-[11px] text-emerald-200/70 mt-1" data-testid="note-state">{state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'failed' ? 'Not saved yet: check your connection' : 'Typing…'}</p>
            </div>
            <button type="button" onClick={saveNow} aria-label="Save" title="Save" data-testid="note-save" className={round}><Save className="w-5 h-5" /></button>
            <button type="button" onClick={share} aria-label="Share" title="Share" data-testid="note-share" className={round}><Share2 className="w-5 h-5" /></button>
            <div className="relative">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-label="More" title="More" data-testid="note-more" className={round}><MoreVertical className="w-5 h-5" /></button>
              {menu && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-[#0c3a2d] border border-white/15 shadow-2xl p-1.5 z-20 text-sm font-semibold">
                  {[
                    { icon: Copy, label: 'Copy all', run: copyAll }, { icon: Download, label: 'Save as .txt', run: download },
                    { icon: Type, label: 'Bigger text', run: () => resize(1) }, { icon: Type, label: 'Smaller text', run: () => resize(-1) },
                    { icon: Undo2, label: 'Undo', run: () => { setMenu(false); edit('undo'); } }, { icon: Redo2, label: 'Redo', run: () => { setMenu(false); edit('redo'); } },
                    { icon: Trash2, label: 'Delete note', run: () => remove(openId), danger: true }
                  ].map(({ icon: Icon, label, run, danger }) => (
                    <button key={label} type="button" onClick={() => { void run(); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 text-left cursor-pointer ${danger ? 'text-red-300' : ''}`}><Icon className="w-4 h-4" />{label}</button>
                  ))}
                </div>
              )}
            </div>
          </header>
          {flash}
          <div className="relative rounded-[32px] bg-[#faf7ee] text-[#1f3d33] shadow-2xl shadow-black/40 px-6 pt-6 pb-28 min-h-[78vh]">
            <input value={title} onChange={(e) => changeTitle(e.target.value)} placeholder="Title…" maxLength={120} data-testid="note-title"
              className="w-full bg-transparent outline-none text-[28px] font-extrabold text-[#37594b] placeholder:text-[#7d9a8d]" />
            <div className="h-px bg-[#c9d8cf] my-3.5" />
            <textarea ref={areaRef} value={body} onChange={(e) => changeBody(e.target.value)} onKeyDown={onKey} onBlur={() => void flush()} placeholder="Write your thoughts here…" spellCheck data-testid="note-text"
              style={{ fontSize: size }} className="w-full min-h-[48vh] bg-transparent outline-none resize-none leading-relaxed text-[#1f3d33] placeholder:text-[#7d9a8d]" />
            <p className="text-[11px] text-[#7d9a8d] mt-2" data-testid="note-stats">{stats.words} words · {stats.chars.toLocaleString()} characters · text only</p>

            <div className="absolute left-3 right-3 bottom-3 rounded-full bg-[#fbf9f1] shadow-[0_10px_30px_rgba(0,0,0,0.18)] px-2 py-2 flex items-center justify-between" data-testid="note-toolbar">
              {[
                { icon: Bold, label: 'Bold', run: () => style('bold') }, { icon: Italic, label: 'Italic', run: () => style('italic') }, { icon: UnderlineIcon, label: 'Underline', run: () => style('underline') },
                { icon: CheckSquare, label: 'Check list', run: () => list('check') }, { icon: List, label: 'Bullet list', run: () => list('bullet') }, { icon: ListOrdered, label: 'Numbered list', run: () => list('number') }
              ].map(({ icon: Icon, label, run }) => (
                <button key={label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={run} aria-label={label} title={label}
                  className="w-11 h-11 rounded-full text-[#4d6b5e] hover:bg-emerald-100 flex items-center justify-center cursor-pointer"><Icon className="w-5 h-5" /></button>
              ))}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={speak} aria-label={listening ? 'Stop speaking' : 'Speak to write'} title={listening ? 'Stop' : 'Speak to write'} data-testid="note-mic"
                className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-100 text-emerald-600'}`}><Mic className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell} data-testid="notepad-list">
      <div className="max-w-2xl mx-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-24">
        <header className="flex items-center gap-2.5 mb-4">
          <button type="button" onClick={back} aria-label="Back" data-testid="settings-back" className={round}><ChevronLeft className="w-6 h-6" /></button>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-black tracking-tight leading-none">Notepad</h1><p className="text-[11px] text-emerald-200/70 mt-1">Your notes stay on your account</p></div>
          <button type="button" onClick={newNote} data-testid="note-new" className="h-11 px-4 rounded-full bg-emerald-400 text-emerald-950 text-sm font-extrabold inline-flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />New</button>
        </header>
        {flash}
        {notes === null ? <p className="py-16 text-center text-sm text-emerald-100/70">Loading…</p> : (
          <div className="space-y-3">
            {error && <p className="px-4 py-3 rounded-2xl bg-red-500/15 border border-red-400/30 text-red-200 text-xs font-semibold">{error}</p>}
            {notes.length > 0 && (
              <label className="flex items-center gap-2 h-12 px-4 rounded-full bg-black/25 border border-white/10 focus-within:border-emerald-300">
                <Search className="w-4 h-4 text-white/60" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your notes" className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/50" data-testid="note-search" />
              </label>
            )}
            {!error && notes.length === 0 && (
              <div className="py-16 text-center space-y-2"><NotebookPen className="w-10 h-10 mx-auto text-emerald-200/60" /><p className="font-bold">No notes yet</p><p className="text-xs text-emerald-100/70">Tap New to write one, or paste something you want to keep. Only text is saved.</p></div>
            )}
            {notes.length > 0 && shown.length === 0 && <p className="py-10 text-center text-sm text-emerald-100/70">No note has that in it.</p>}
            {shown.map((n) => (
              <div key={n.id} className="flex items-stretch rounded-3xl bg-[#faf7ee] text-[#1f3d33] shadow-lg shadow-black/20 overflow-hidden">
                <button type="button" onClick={() => open(n)} className="flex-1 min-w-0 text-left px-5 py-4 hover:bg-emerald-50 cursor-pointer" data-testid="note-row">
                  <span className="block text-[15px] font-extrabold truncate">{noteTitle(n.body)}</span>
                  <span className="block text-xs text-[#5f7a6d] truncate mt-0.5">{n.body.trim().split(/\r?\n/).slice(1).join(' ').slice(0, 90) || 'No more text'}</span>
                  <span className="block text-[10px] text-[#8aa396] mt-1">{when(n.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => remove(n.id)} aria-label="Delete note" className="px-4 text-[#9bb0a5] hover:text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
