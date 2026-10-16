import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, Loader2, Trash2, Calendar, Heart, Clock, ShieldCheck, Sparkles, Eraser } from 'lucide-react';
import {
  adminFetchDailyOverview, adminSetDailyChallenge, adminAssignDailyChallengeWinners, deleteDailyChallengeEntry, adminRemoveDueMediaNow
} from '../../services/api';
import type { AdminDailyOverview } from '../../services/api';

// The admin's Daily NOOB page. It opens on today and shows the entries by itself (nothing to press to load them), with each one's picture or video, who made it and how many
// votes it has. Each day ends at 00:00 UTC: the server then pays the top three by votes and permanently deletes that day's entries, votes AND their files from storage - this page
// only shows that, it never has to be visited for it to happen. Before the day ends the admin can pay the winners by hand instead, remove an entry, or set a day's task.
const todayUtc = () => new Date().toISOString().slice(0, 10);

const untilDayEnds = (): string => {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(0, Math.round((end - now.getTime()) / 60000));
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
};

const input = 'bg-zinc-950 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-amber-400';
const quietBtn = 'px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-default';
const card = 'p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3';

export const AdminDailyNoobPanel: React.FC = () => {
  const [date, setDate] = useState(todayUtc);
  const [data, setData] = useState<AdminDailyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [third, setThird] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [taskDate, setTaskDate] = useState(todayUtc);
  const [taskText, setTaskText] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const res = await adminFetchDailyOverview(d);
    if (res.success && res.overview) {
      setData(res.overview);
      // the leaders by votes are already picked for the "pay now" boxes
      const ranked = res.overview.entries.filter((e) => e.votesCount > 0);
      setFirst(ranked[0]?.userId || ''); setSecond(ranked[1]?.userId || ''); setThird(ranked[2]?.userId || '');
    } else {
      setData(null);
      setNote({ text: res.error || 'Could not load Daily NOOB.', ok: false });
    }
    setConfirmPay(false); setConfirmDelete(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(date); }, [date, load]);

  const totalVotes = useMemo(() => (data ? data.entries.reduce((n, e) => n + e.votesCount, 0) : 0), [data]);
  const isToday = date === (data?.today ?? todayUtc());

  const removeEntry = async (id: string) => {
    setBusyId(id);
    const res = await deleteDailyChallengeEntry(id);
    setNote(res.success ? { text: 'Entry deleted. Its file is removed from the server in a few minutes.', ok: true } : { text: res.error || 'Could not delete that entry.', ok: false });
    setBusyId(null);
    await load(date);
  };

  const payNow = async () => {
    if (!first) { setNote({ text: 'Pick at least a 1st place.', ok: false }); return; }
    setPaying(true);
    const res = await adminAssignDailyChallengeWinners(date, first, second || null, third || null);
    setNote(res.success ? { text: `Winners paid for ${date}. The day's entries and files are being deleted.`, ok: true } : { text: res.error || 'Could not pay the winners.', ok: false });
    setPaying(false);
    await load(date);
  };

  const saveTask = async () => {
    setSavingTask(true);
    const res = await adminSetDailyChallenge(taskDate, taskText);
    if (res.success) { setNote({ text: `Task saved for ${taskDate}.`, ok: true }); setTaskText(''); if (taskDate === date) await load(date); }
    else setNote({ text: res.error || 'Could not save that task.', ok: false });
    setSavingTask(false);
  };

  const removeFilesNow = async () => {
    setCleaning(true);
    const res = await adminRemoveDueMediaNow();
    setNote(res.success ? { text: res.removed ? `${res.removed} file${res.removed === 1 ? '' : 's'} removed from the server.` : 'Nothing is due yet - files are removed a few minutes after an entry is deleted.', ok: true } : { text: res.error || 'Could not remove the files.', ok: false });
    setCleaning(false);
    await load(date);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="text-sm font-black text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Daily NOOB</span>
            <span className="text-[11px] text-zinc-400 block mt-1 max-w-md leading-relaxed">
              When a day ends (00:00 UTC) the top three by votes are paid automatically, and that day's entries, votes and uploaded files are permanently deleted from the server. Nothing needs to be opened or pressed for that to happen.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} max={data?.today ?? todayUtc()} onChange={(e) => e.target.value && setDate(e.target.value)} className={input} aria-label="Day" />
            {!isToday && <button onClick={() => setDate(data?.today ?? todayUtc())} className={quietBtn}>Today</button>}
          </div>
        </div>

        {note && (
          <div role="status" className={`text-[11px] font-semibold px-3 py-2 rounded-xl border border-dashed ${note.ok ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-red-300 border-red-500/30 bg-red-500/10'}`}>{note.text}</div>
        )}

        {data && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {data.date}</span>
            {data.settled ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Finished · winners paid</span>
            ) : isToday ? (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Open · ends in {untilDayEnds()}</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">Ended · being settled</span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{data.entries.length} {data.entries.length === 1 ? 'entry' : 'entries'}</span>
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200 flex items-center gap-1.5"><Heart className="w-3 h-3" /> {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
          </div>
        )}
        {data && <p className="text-[11px] text-zinc-400">Task for {data.date}: <span className="text-zinc-200">{data.prompt ? `"${data.prompt}"` : 'none set yet (one is picked automatically)'}</span></p>}
      </div>

      {loading && !data ? (
        <div className="py-10 flex items-center justify-center text-zinc-400 gap-2 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Loading entries…</div>
      ) : data && (
        <>
          <div className={card}>
            <span className="text-xs font-bold text-white block">Entries {loading && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}</span>
            {data.entries.length === 0 ? (
              data.settled ? (
                <div className="py-6 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-amber-400 mx-auto" />
                  <p className="text-xs text-zinc-300 font-semibold">This day is finished.</p>
                  <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">The winners were paid, and the entries, votes and files were permanently deleted from the server.</p>
                  {data.podium.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 pt-1">
                      {data.podium.map((p) => <span key={p.rank} className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-bold">{p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉'} @{p.username} · {p.votesCount} votes</span>)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-6 text-center">No entries yet for this day.</p>
              )
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.entries.map((e, i) => (
                  <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col">
                    <div className="relative aspect-[4/5] bg-black">
                      {e.mediaType === 'video'
                        ? <video src={e.mediaUrl} className="w-full h-full object-cover" controls preload="metadata" playsInline muted />
                        : <img src={e.mediaUrl} alt={`Entry by @${e.username}`} loading="lazy" className="w-full h-full object-cover" />}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-black text-white">{i === 0 && e.votesCount > 0 ? '👑 ' : ''}{e.votesCount} {e.votesCount === 1 ? 'vote' : 'votes'}</span>
                    </div>
                    <div className="p-2.5 space-y-1.5 flex-1 flex flex-col">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <img src={e.userAvatar || '/noob-logo.svg.jpeg'} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                        <span className="text-[11px] font-bold text-white truncate">@{e.username}</span>
                      </div>
                      {e.caption && <p className="text-[11px] text-zinc-400 line-clamp-2">{e.caption}</p>}
                      <p className="text-[10px] text-zinc-600">{new Date(e.createdAt).toLocaleString()}</p>
                      <div className="mt-auto pt-1">
                        {confirmDelete === e.id ? (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => void removeEntry(e.id)} disabled={busyId === e.id} className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50">{busyId === e.id ? 'Deleting…' : 'Delete for good'}</button>
                            <button onClick={() => setConfirmDelete(null)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(e.id)} className="w-full py-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/15 border border-zinc-800 text-zinc-300 hover:text-red-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Trash2 className="w-3 h-3" /> Delete entry</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!data.settled && data.entries.length > 0 && (
            <div className={card}>
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Pay the winners now</span>
                <span className="text-[11px] text-zinc-400 block mt-1">Left alone, the top three by votes are paid automatically when the day ends. Pay by hand if you want different winners: 10,000 / 5,000 / 2,500 points, and the day's entries and files are deleted right away.</span>
              </div>
              {([
                { label: '1st — 10,000 pts', value: first, set: setFirst },
                { label: '2nd — 5,000 pts', value: second, set: setSecond },
                { label: '3rd — 2,500 pts', value: third, set: setThird }
              ] as const).map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 w-28 shrink-0">{row.label}</span>
                  <select value={row.value} onChange={(e) => row.set(e.target.value)} className={`flex-1 ${input}`}>
                    <option value="">— none —</option>
                    {data.entries.map((e) => <option key={e.userId} value={e.userId}>@{e.username} ({e.votesCount} votes)</option>)}
                  </select>
                </div>
              ))}
              {confirmPay ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => void payNow()} disabled={paying || !first} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs disabled:opacity-40 cursor-pointer">{paying ? 'Paying out…' : 'Yes — pay and delete the entries'}</button>
                  <button onClick={() => setConfirmPay(false)} className={quietBtn}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmPay(true)} disabled={!first} className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs disabled:opacity-40 cursor-pointer">Assign & pay out</button>
              )}
            </div>
          )}

          <div className={card}>
            <span className="text-xs font-bold text-white block">🔥 Task of a day</span>
            <span className="text-[11px] text-zinc-400 block">Sets (or schedules ahead) the task people see on Daily NOOB. Without one, a task is picked from the automatic pool.</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={taskDate} min={data.today} onChange={(e) => e.target.value && setTaskDate(e.target.value)} className={input} aria-label="Day of the task" />
              <input type="text" value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="e.g. Post the funniest picture in your gallery." maxLength={300} className={`flex-1 min-w-[160px] ${input}`} />
              <button onClick={() => void saveTask()} disabled={savingTask || !taskText.trim()} className={quietBtn}>{savingTask ? 'Saving…' : 'Save'}</button>
            </div>
          </div>

          <div className={card}>
            <span className="text-xs font-bold text-white block">Recent days</span>
            <div className="space-y-1.5">
              {data.days.length === 0 && <p className="text-[11px] text-zinc-500">No days yet.</p>}
              {data.days.map((d) => (
                <button key={d.date} onClick={() => setDate(d.date)} className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] flex items-center gap-2 flex-wrap cursor-pointer ${d.date === data.date ? 'border-amber-400/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900'}`}>
                  <span className="font-bold text-white w-24 shrink-0">{d.date}</span>
                  {d.settled
                    ? <span className="text-emerald-300 font-semibold">Finished{d.winner ? ` · 🥇 @${d.winner}` : ' · no winner'} · entries & files deleted</span>
                    : <span className="text-amber-300 font-semibold">{d.date === data.today ? 'Open' : 'Waiting to be settled'} · {d.entries} {d.entries === 1 ? 'entry' : 'entries'} · {d.votes} {d.votes === 1 ? 'vote' : 'votes'}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-2"><Eraser className="w-4 h-4 text-zinc-300" /> Files on the server</span>
                <span className="text-[11px] text-zinc-400 block mt-1">
                  {data.filesQueued > 0
                    ? `${data.filesQueued} Daily NOOB file${data.filesQueued === 1 ? ' is' : 's are'} waiting to be deleted from storage (the server does it by itself within minutes).`
                    : 'No Daily NOOB file is waiting. Finished days leave nothing behind.'}
                </span>
              </div>
              <button onClick={() => void removeFilesNow()} disabled={cleaning} className={quietBtn}>{cleaning ? 'Removing…' : 'Remove due files now'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
