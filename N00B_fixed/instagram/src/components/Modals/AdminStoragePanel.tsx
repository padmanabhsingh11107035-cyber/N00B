import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Loader2, Eraser, Search, Ban, ShieldCheck } from 'lucide-react';
import {
  adminFetchStorageOverview, adminSetMediaCleanup, adminScanUnusedMedia, adminQueueUnusedMedia, adminCancelMediaQueue, adminRemoveDueMediaNow
} from '../../services/api';
import type { AdminStorageOverview, AdminUnusedScan } from '../../services/api';

// The admin's Storage page: what the server is holding, what is waiting to be deleted, and files that nothing uses any more (left behind by things that happened before the
// automatic cleanup existed). Automatic cleanup removes the old file whenever a profile picture is replaced, a post / reel / video / message / entry is deleted or a Daily NOOB
// day ends - and a file is only ever deleted when NOTHING in the app still points to it, checked again at the very moment of deleting.
const formatBytes = (n: number): string => {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const quietBtn = 'px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-default';
const card = 'p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3';

export const AdminStoragePanel: React.FC = () => {
  const [data, setData] = useState<AdminStorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<'switch' | 'remove' | 'cancel' | 'scan' | 'queue' | null>(null);
  const [minAge, setMinAge] = useState(3);
  const [scan, setScan] = useState<AdminUnusedScan | null>(null);

  const load = useCallback(async () => {
    const res = await adminFetchStorageOverview();
    if (res.success && res.overview) setData(res.overview);
    else setNote({ text: res.error || 'Could not read the storage overview.', ok: false });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggleSwitch = async () => {
    if (!data) return;
    setBusy('switch');
    const res = await adminSetMediaCleanup(!data.cleanupEnabled);
    setNote(res.success ? { text: data.cleanupEnabled ? 'Automatic cleanup is OFF: nothing is deleted by itself until you switch it on.' : 'Automatic cleanup is ON.', ok: true } : { text: res.error || 'Could not change that.', ok: false });
    setBusy(null);
    await load();
  };

  const removeNow = async () => {
    setBusy('remove');
    const res = await adminRemoveDueMediaNow();
    setNote(res.success ? { text: res.removed ? `${res.removed} file${res.removed === 1 ? '' : 's'} permanently removed from the server.` : 'Nothing is due yet.', ok: true } : { text: res.error || 'Could not remove the files.', ok: false });
    setBusy(null);
    await load();
  };

  const cancelAll = async () => {
    setBusy('cancel');
    const res = await adminCancelMediaQueue();
    setNote(res.success ? { text: `${res.cancelled ?? 0} waiting file${res.cancelled === 1 ? '' : 's'} cancelled: they stay.`, ok: true } : { text: res.error || 'Could not cancel.', ok: false });
    setBusy(null);
    await load();
  };

  const runScan = async () => {
    setBusy('scan');
    setScan(null);
    const res = await adminScanUnusedMedia(minAge);
    if (res.success && res.scan) setScan(res.scan);
    else setNote({ text: res.error || 'Could not look for unused files.', ok: false });
    setBusy(null);
  };

  const queueUnused = async () => {
    setBusy('queue');
    const res = await adminQueueUnusedMedia(minAge, 500);
    if (res.success) {
      setNote({ text: `${res.queued ?? 0} unused file${res.queued === 1 ? '' : 's'} will be deleted in 24 hours (cancel any time).${res.remaining ? ` ${res.remaining} more found - press again to queue them.` : ''}`, ok: true });
      setScan(null);
    } else setNote({ text: res.error || 'Could not queue the files.', ok: false });
    setBusy(null);
    await load();
  };

  if (loading) return <div className="py-10 flex items-center justify-center text-zinc-400 gap-2 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Reading the storage…</div>;

  const top = data ? Math.max(1, ...data.folders.map((f) => f.bytes)) : 1;

  return (
    <div className="space-y-4">
      {note && <div role="status" className={`text-[11px] font-semibold px-3 py-2 rounded-xl border border-dashed ${note.ok ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-red-300 border-red-500/30 bg-red-500/10'}`}>{note.text}</div>}
      {!data ? (
        <div className={card}><p className="text-xs text-zinc-400">The storage overview could not be read. If the "storage cleanup" update has not been run in the database yet, run it first.</p></div>
      ) : (
        <>
          <div className={card}>
            <span className="text-sm font-black text-white flex items-center gap-2"><HardDrive className="w-4 h-4 text-amber-400" /> Storage in use</span>
            <p className="text-xs text-zinc-300"><span className="text-lg font-black text-white">{formatBytes(data.bytes)}</span> in <span className="font-bold text-white">{data.files.toLocaleString()}</span> files</p>
            <div className="space-y-1.5">
              {data.folders.map((f) => (
                <div key={f.folder} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 text-zinc-300 font-semibold truncate">{f.folder}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full bg-amber-400/80" style={{ width: `${Math.max(2, Math.round((f.bytes / top) * 100))}%` }} /></div>
                  <span className="w-28 shrink-0 text-right text-zinc-400">{formatBytes(f.bytes)} · {f.files.toLocaleString()}</span>
                </div>
              ))}
              {data.folders.length === 0 && <p className="text-[11px] text-zinc-500">Nothing is stored.</p>}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Automatic cleanup</span>
                <span className="text-[11px] text-zinc-400 block mt-1 leading-relaxed">
                  The old file is deleted from the server when a profile or group picture is replaced, when a post, reel, video, story, comment, message or Daily NOOB entry is deleted, and when an account is deleted.
                  Daily NOOB entries go within minutes; profile pictures after an hour; everything else after 24 hours. A file is only deleted if nothing in the app still uses it.
                </span>
              </div>
              <button
                onClick={() => void toggleSwitch()}
                disabled={busy === 'switch'}
                role="switch"
                aria-checked={data.cleanupEnabled}
                aria-label="Automatic cleanup"
                className={`relative w-11 h-6 rounded-full shrink-0 cursor-pointer transition-colors ${data.cleanupEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${data.cleanupEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{data.queue.pending} waiting ({formatBytes(data.queue.bytes)})</span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{data.queue.due} due now</span>
              {data.queue.failed > 0 && <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-300">{data.queue.failed} could not be removed</span>}
              <span className={`px-2.5 py-1 rounded-full ${data.serverCleanupReady ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{data.serverCleanupReady ? 'Server job ready' : 'Server job not set up'}</span>
            </div>
            {!data.serverCleanupReady && <p className="text-[11px] text-amber-300/90">The server's own job (the nightly clean-up) is not connected, so files are only removed when you press "Remove due files now".</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void removeNow()} disabled={busy !== null} className={quietBtn}>{busy === 'remove' ? 'Removing…' : 'Remove due files now'}</button>
              <button onClick={() => void cancelAll()} disabled={busy !== null || data.queue.pending === 0} className={quietBtn}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel all waiting'}</button>
            </div>
          </div>

          <div className={card}>
            <span className="text-xs font-bold text-white flex items-center gap-2"><Eraser className="w-4 h-4 text-zinc-300" /> Files nothing uses</span>
            <span className="text-[11px] text-zinc-400 block leading-relaxed">
              Looks through every table of the app for files that no picture, post, message or setting points to - the ones left behind before the automatic cleanup existed. Looking changes nothing.
              Files you queue are deleted 24 hours later, and each one is checked once more at that moment.
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-zinc-400">Only files older than</span>
              <select value={minAge} onChange={(e) => { setMinAge(Number(e.target.value)); setScan(null); }} className="bg-zinc-950 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-amber-400" aria-label="Minimum age">
                <option value={3}>3 days</option><option value={7}>7 days</option><option value={30}>30 days</option>
              </select>
              <button onClick={() => void runScan()} disabled={busy !== null} className={`${quietBtn} flex items-center gap-1.5`}>{busy === 'scan' ? <><Loader2 className="w-3 h-3 animate-spin" /> Looking…</> : <><Search className="w-3 h-3" /> Look for unused files</>}</button>
            </div>
            {scan && (
              scan.files === 0 ? (
                <p className="text-xs text-emerald-300 font-semibold">Nothing found: every file is in use. 👍</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-200"><span className="font-black text-white">{scan.files.toLocaleString()}</span> unused file{scan.files === 1 ? '' : 's'} · <span className="font-black text-white">{formatBytes(scan.bytes)}</span></p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold">{scan.folders.map((f) => <span key={f.folder} className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-200">{f.folder}: {f.files} · {formatBytes(f.bytes)}</span>)}</div>
                  {scan.sample.length > 0 && <p className="text-[10px] text-zinc-500 font-mono break-all">e.g. {scan.sample.join(' · ')}</p>}
                  <button onClick={() => void queueUnused()} disabled={busy !== null} className="w-full py-2.5 rounded-xl bg-red-500 text-white font-bold text-xs disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"><Ban className="w-3.5 h-3.5" /> {busy === 'queue' ? 'Queuing…' : 'Delete these files in 24 hours'}</button>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
};
