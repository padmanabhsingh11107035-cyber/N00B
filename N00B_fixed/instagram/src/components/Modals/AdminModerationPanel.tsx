import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Loader2, FlaskConical, Undo2, Ban, ShieldCheck, Mail } from 'lucide-react';
import {
  adminModerationOverview, adminModerationLog, adminModerationSet, adminModerationForgive, adminModerationHealth, adminModerationTest, suspendUserAccount
} from '../../services/api';
import type { ModerationOverview, ModerationLogRow, ModerationMode, ModerationVerdict, ModerationHealth } from '../../services/api';

// The admin's Moderator page (NOOB Safety): an AI that reads only what people PUBLISH (posts, reels, comments, bio, display name) - never chats, calls or anything private.
// It starts in "Watch only": it judges and writes down what it would have done, but touches nothing and tells nobody, so the administrator can see how it judges first.
const quietBtn = 'px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-default';
const card = 'p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3';
const KINDS: Record<string, string> = { post: 'Post', reel: 'Reel', comment: 'Comment', bio: 'Bio', name: 'Display name', video: 'Video', story: 'Story', daily: 'Daily NOOB', poll: 'Poll', live: 'Live comment', room: 'Room chat', note: 'Status note' };
const FILTERS: Array<{ id: 'all' | 'removed' | 'flagged' | 'suspended' | 'watched'; label: string }> = [
  { id: 'all', label: 'Everything' }, { id: 'removed', label: 'Acted on' }, { id: 'flagged', label: 'Needs a look' }, { id: 'watched', label: 'Watch only' }, { id: 'suspended', label: 'Suspended' }
];
const MODES: Array<{ id: ModerationMode; label: string; blurb: string }> = [
  { id: 'off', label: 'Off', blurb: 'Nothing is judged.' },
  { id: 'watch', label: 'Watch only', blurb: 'Judges and writes it down below. Deletes nothing, warns nobody.' },
  { id: 'enforce', label: 'Enforce', blurb: 'Removes the bad word or the whole post / reel, sends the notice and the e-mail, counts strikes, suspends.' }
];

const ago = (iso: string): string => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const AdminModerationPanel: React.FC = () => {
  const [data, setData] = useState<ModerationOverview | null>(null);
  const [health, setHealth] = useState<ModerationHealth | null>(null);
  const [healthError, setHealthError] = useState('');
  const [rows, setRows] = useState<ModerationLogRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'removed' | 'flagged' | 'suspended' | 'watched'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [testText, setTestText] = useState('');
  const [testImage, setTestImage] = useState('');
  const [verdict, setVerdict] = useState<ModerationVerdict | null>(null);

  const load = useCallback(async (f = filter) => {
    const [o, l] = await Promise.all([adminModerationOverview(), adminModerationLog(f, 80)]);
    if (o.success && o.overview) setData(o.overview);
    else setNote({ text: o.error || 'Could not open the moderator. If the "AI moderator" update has not been run in the database yet, run it first.', ok: false });
    if (l.success) setRows(l.rows);
    setLoading(false);
  }, [filter]);
  useEffect(() => { void load(filter); }, [load, filter]);
  useEffect(() => {
    void adminModerationHealth().then((h) => { if (h.success && h.health) { setHealth(h.health); setHealthError(''); } else setHealthError(h.error || ''); });
  }, []);

  const change = async (patch: Parameters<typeof adminModerationSet>[0], done?: string) => {
    setBusy('set');
    const res = await adminModerationSet(patch);
    if (res.success && res.overview) { setData(res.overview); if (done) setNote({ text: done, ok: true }); }
    else setNote({ text: res.error || 'Could not change that.', ok: false });
    setBusy(null);
  };

  const runTest = async () => {
    if (!testText.trim() && !testImage.trim()) return;
    setBusy('test');
    setVerdict(null);
    const res = await adminModerationTest(testText, { imageUrl: testImage.trim(), strictness: data?.settings.strictness });
    if (res.success && res.verdict) setVerdict(res.verdict);
    else setNote({ text: res.error || 'The AI did not answer.', ok: false });
    setBusy(null);
  };

  const forgive = async (id: string) => {
    setBusy(id);
    const res = await adminModerationForgive(id);
    setNote(res.success ? { text: 'The warning is withdrawn: it no longer counts, and the person was told.', ok: true } : { text: res.error || 'Could not withdraw it.', ok: false });
    setBusy(null);
    await load();
  };

  const toggleSuspend = async (r: ModerationLogRow) => {
    setBusy(r.id);
    const res = await suspendUserAccount({ targetUserId: r.userId, suspend: !r.isSuspended, reason: r.isSuspended ? undefined : `NOOB Safety review: ${r.reason}` });
    setNote(res.success ? { text: res.message || 'Done.', ok: true } : { text: res.error || res.message || 'Could not change the account.', ok: false });
    setBusy(null);
    await load();
  };

  if (loading) return <div className="py-10 flex items-center justify-center text-zinc-400 gap-2 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Opening the moderator…</div>;
  const st = data?.settings;

  return (
    <div className="space-y-4" data-testid="admin-moderation">
      {note && <div role="status" className={`text-[11px] font-semibold px-3 py-2 rounded-xl border border-dashed ${note.ok ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-red-300 border-red-500/30 bg-red-500/10'}`}>{note.text}</div>}
      {!data || !st ? (
        <div className={card}><p className="text-xs text-zinc-400">The moderator could not be opened. Run the "AI moderator" update in the database first.</p></div>
      ) : (
        <>
          <div className={card}>
            <span className="text-sm font-black text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-400" /> NOOB Safety - AI moderator</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Reads only what people publish: posts and reels (caption and first pictures), comments, bios and display names. Chats, calls and anything private are never read.
              The AI only gives a verdict; the database does the rest.
            </p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Moderator mode">
              {MODES.map((m) => (
                <button key={m.id} role="radio" aria-checked={st.mode === m.id} disabled={busy === 'set'}
                  onClick={() => void change({ mode: m.id }, m.id === 'enforce' ? 'Enforce is ON: bad words are removed and notices and e-mails go out.' : m.id === 'watch' ? 'Watch only: it judges and logs, nothing is touched.' : 'The moderator is OFF.')}
                  data-testid={`mod-mode-${m.id}`}
                  className={`px-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer border transition-colors ${st.mode === m.id ? (m.id === 'enforce' ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200' : m.id === 'watch' ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-zinc-700 border-zinc-500 text-white') : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400">{MODES.find((m) => m.id === st.mode)?.blurb}</p>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              {health ? (
                <>
                  <span className={`px-2.5 py-1 rounded-full ${health.keys > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{health.keys} AI key{health.keys === 1 ? '' : 's'}</span>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{health.textModels[0]}</span>
                  <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">pictures: {health.visionModels[0].split('/').pop()}</span>
                  <span className={`px-2.5 py-1 rounded-full ${health.email ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{health.email ? 'E-mail ready' : 'No e-mail key'}</span>
                </>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">{healthError || 'Checking the AI…'}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { n: data.counts.removed24h, l: 'Removed (24 h)' }, { n: data.counts.wordsRemoved24h, l: 'Words removed (24 h)' },
              { n: data.counts.flagged, l: 'Need a look (7 d)' }, { n: data.counts.suspended7d, l: 'Suspended (7 d)' },
              { n: data.counts.watched, l: 'Watch only (7 d)' }, { n: data.counts.waiting, l: 'Waiting for the AI' },
              { n: data.counts.failed, l: 'AI failed (2 d)' }, { n: data.counts.emailsFailed, l: 'E-mails failed' }
            ].map((c) => (
              <div key={c.l} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <span className="block text-lg font-black text-white">{c.n}</span>
                <span className="block text-[10px] text-zinc-400 font-semibold">{c.l}</span>
              </div>
            ))}
          </div>

          <div className={card}>
            <span className="text-xs font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Rules</span>
            <div className="grid sm:grid-cols-2 gap-3 text-[11px] text-zinc-300">
              <label className="space-y-1 block">
                <span className="font-bold text-white">Strictness</span>
                <select value={st.strictness} disabled={busy === 'set'} onChange={(e) => void change({ strictness: e.target.value as 'standard' | 'strict' })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white">
                  <option value="standard">Standard - abuse, hate, sexual, threats, scams (casual "damn" is fine)</option>
                  <option value="strict">Strict - every profanity too</option>
                </select>
              </label>
              <label className="space-y-1 block">
                <span className="font-bold text-white">How sure the AI must be: {Math.round(st.minConfidence * 100)}%</span>
                <input type="range" min={60} max={100} step={5} value={Math.round(st.minConfidence * 100)} disabled={busy === 'set'}
                  onChange={(e) => setData({ ...data, settings: { ...st, minConfidence: Number(e.target.value) / 100 } })}
                  onPointerUp={() => void change({ minConfidence: st.minConfidence })} onKeyUp={() => void change({ minConfidence: st.minConfidence })}
                  className="w-full accent-amber-400" aria-label="Confidence needed" />
                <span className="block text-zinc-500">Below this nothing is touched; from 60% it lands in "Needs a look".</span>
              </label>
              <label className="space-y-1 block">
                <span className="font-bold text-white">Suspend after (warnings)</span>
                <input type="number" min={1} max={20} value={st.strikesToSuspend} disabled={busy === 'set'}
                  onChange={(e) => setData({ ...data, settings: { ...st, strikesToSuspend: Number(e.target.value) || 1 } })}
                  onBlur={() => void change({ strikes: st.strikesToSuspend })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white" />
              </label>
              <label className="space-y-1 block">
                <span className="font-bold text-white">...within (days)</span>
                <input type="number" min={1} max={365} value={st.strikeWindowDays} disabled={busy === 'set'}
                  onChange={(e) => setData({ ...data, settings: { ...st, strikeWindowDays: Number(e.target.value) || 1 } })}
                  onBlur={() => void change({ windowDays: st.strikeWindowDays })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white" />
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">A very serious violation (for example sexual content with minors or a real threat) suspends at once.</p>
          </div>

          <div className={card}>
            <span className="text-xs font-bold text-white flex items-center gap-2"><FlaskConical className="w-4 h-4 text-sky-400" /> Try the AI (nothing is saved or sent)</span>
            <textarea value={testText} onChange={(e) => setTestText(e.target.value)} rows={3} placeholder="Type a comment or caption to see how the AI judges it"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500" data-testid="mod-test-text" />
            <input value={testImage} onChange={(e) => setTestImage(e.target.value)} placeholder="Optional: a picture address (https://…)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500" />
            <button onClick={() => void runTest()} disabled={busy === 'test' || (!testText.trim() && !testImage.trim())} className={quietBtn} data-testid="mod-test-run">{busy === 'test' ? 'Asking…' : 'Ask the AI'}</button>
            {verdict && (
              <div className={`text-[11px] rounded-xl border px-3 py-2 space-y-1 ${verdict.violation ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`} data-testid="mod-test-verdict">
                <p className="font-bold">{verdict.violation ? `Breaks the rules - ${verdict.severity} (${verdict.category}), ${Math.round(verdict.confidence * 100)}% sure` : `Fine (${Math.round(verdict.confidence * 100)}% sure)`}</p>
                {verdict.reason && <p>{verdict.reason}</p>}
                {verdict.words.length > 0 && <p>Words it would take out: {verdict.words.join(', ')}</p>}
                {verdict.mediaViolation && <p>The picture breaks the rules.</p>}
                {verdict.violation && <p className="text-zinc-300">It would act only if it is at least {Math.round(st.minConfidence * 100)}% sure.</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Log filter">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer ${filter === f.id ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{f.label}</button>
              ))}
            </div>
            {rows.length === 0 && <p className="text-[11px] text-zinc-500 px-1 py-4">Nothing here yet. Only things that broke a rule (or looked like it) are written down; clean content leaves no trace.</p>}
            {rows.map((r) => (
              <div key={r.id} className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2" data-testid="mod-row">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                  <span className="text-sm font-black text-white mr-1">@{r.username}</span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200">{KINDS[r.kind] || r.kind}</span>
                  <span className={`px-2 py-0.5 rounded-full ${!r.applied ? (r.action === 'flagged' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300') : r.action === 'deleted' ? 'bg-red-500/15 text-red-300' : 'bg-orange-500/15 text-orange-300'}`}>
                    {r.action === 'flagged' ? 'Needs a look' : !r.applied ? `Watch only: would ${r.action === 'deleted' ? 'remove it' : 'take the words out'}` : r.action === 'deleted' ? 'Removed' : 'Words removed'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{r.category} · {r.severity} · {Math.round(r.confidence * 100)}%</span>
                  {r.applied && r.strikeNo > 0 && <span className={`px-2 py-0.5 rounded-full ${r.forgiven ? 'bg-zinc-800 text-zinc-500 line-through' : 'bg-red-500/15 text-red-300'}`}>warning {r.strikeNo}/{r.strikeLimit}</span>}
                  {r.suspended && <span className="px-2 py-0.5 rounded-full bg-red-500/25 text-red-200">suspended</span>}
                  {r.applied && (
                    <span className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${r.emailStatus === 'sent' ? 'bg-emerald-500/15 text-emerald-300' : r.emailStatus === 'failed' ? 'bg-red-500/15 text-red-300' : 'bg-zinc-800 text-zinc-400'}`} title={r.emailError || undefined}>
                      <Mail className="w-3 h-3" /> {r.emailStatus === 'none' ? 'no e-mail' : r.emailStatus}
                    </span>
                  )}
                  <span className="ml-auto text-zinc-500 font-semibold">{ago(r.createdAt)}</span>
                </div>
                <p className="text-[11px] text-zinc-300"><span className="font-bold text-white">Why:</span> {r.reason}</p>
                {r.content && <p className="text-[11px] text-zinc-400 bg-black/30 rounded-lg px-2.5 py-1.5 break-words">{r.content}</p>}
                {r.words.length > 0 && <p className="text-[10px] text-zinc-500">Words: {r.words.join(', ')}</p>}
                <div className="flex flex-wrap gap-2">
                  {r.applied && !r.forgiven && r.strikeNo > 0 && (
                    <button onClick={() => void forgive(r.id)} disabled={busy === r.id} className={`${quietBtn} inline-flex items-center gap-1.5`}><Undo2 className="w-3.5 h-3.5" /> Withdraw the warning</button>
                  )}
                  <button onClick={() => void toggleSuspend(r)} disabled={busy === r.id} className={`${quietBtn} inline-flex items-center gap-1.5`}>
                    <Ban className="w-3.5 h-3.5" /> {r.isSuspended ? 'Restore the account' : 'Suspend the account'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
