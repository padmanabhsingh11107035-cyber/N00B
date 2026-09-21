import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, KeyRound, Lock, LockOpen, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react';
import { e2ee } from '../../services/api';
import type { ChatCrypto, KeyStatus } from '../../e2ee/service.ts';

// ------------------------------------------------------------------------------------------------ what a chat's lock means
interface ChatEncryptionModalProps {
  info: ChatCrypto | null;
  title: string;
  onClose: () => void;
  onOpenSettings: () => void;
  onAcknowledge: () => void;
}

const reasonText = (info: ChatCrypto): string => {
  if (info.reason === 'missing') {
    const who = info.missing.length ? info.missing.map((n) => `@${n}`).join(', ') : 'Somebody in this chat';
    return `${who} ${info.missing.length > 1 ? 'have' : 'has'} not opened the updated NOOB yet, so this chat is not locked for now. Messages are sent normally until then, and the chat locks itself as soon as everybody has opened the app.`;
  }
  if (info.reason === 'public') return 'This is a public room: everybody can read what is said here, so its messages are not encrypted.';
  if (info.reason === 'large') return 'Groups of more than 100 people are not end-to-end encrypted.';
  if (info.reason === 'blocked') return 'This device could not set up its chat keys (a private browsing window can cause this), so it can not send private messages. Please use a normal browser window.';
  return 'End-to-end encryption is not switched on for this chat.';
};

export const ChatEncryptionModal: React.FC<ChatEncryptionModalProps> = ({ info, title, onClose, onOpenSettings, onAcknowledge }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const locked = !!info?.encryptable;
  const groups = info?.peer?.code ? info.peer.code.split(' ') : [];
  return (
    <div className="fixed inset-0 z-[125] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Chat encryption">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${locked ? 'bg-[#00FF66]/15 border-[#00FF66]/40' : 'bg-amber-500/15 border-amber-500/30'}`}>
            {locked ? <Lock className="w-4 h-4 text-[#00FF66]" /> : <LockOpen className="w-4 h-4 text-amber-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">{locked ? 'This chat is end-to-end encrypted' : 'This chat is not end-to-end encrypted'}</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 truncate" translate="no">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[12px] text-zinc-300 leading-relaxed">
          {locked ? (
            <p>Messages here are locked on your device and only opened on the devices of the people in this chat. Nobody else can read them, not even NOOB&apos;s servers.</p>
          ) : (
            <p>{info ? reasonText(info) : 'Checking…'}</p>
          )}

          {locked && info?.peer?.changed && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-amber-100">
                  <span translate="no">@{info.peer.username}</span>&apos;s security code has changed. This usually means they started using a new phone or browser. If you want to be sure, compare the new code with them.
                </p>
                <button type="button" onClick={onAcknowledge} className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-[11px] font-black cursor-pointer">Got it</button>
              </div>
            </div>
          )}

          {locked && info?.peer && (
            <div>
              <div className="text-[11px] font-black text-white mb-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[#00FF66]" /> Security code</div>
              <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-black/50 border border-zinc-800 p-3 font-mono text-sm text-white text-center" translate="no" dir="ltr">
                {groups.map((g, i) => <span key={i}>{g}</span>)}
              </div>
              <p className="mt-1.5 text-zinc-400">
                Compare this number with <span translate="no">@{info.peer.username}</span> in person or on a call. If it is exactly the same on both phones, nobody is listening in the middle.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
            <div className="text-[11px] font-black text-white">What is locked, and what is not</div>
            <p><span className="text-[#00FF66] font-bold">Locked:</span> text messages, replies, edits, and GIFs and stickers.</p>
            <p><span className="text-amber-300 font-bold">Not locked yet:</span> photos, videos, voice notes, shared music and game invites are stored normally.</p>
            <p><span className="text-zinc-400 font-bold">Still visible to NOOB:</span> who is in a chat and when messages are sent. Notifications only say &quot;New message&quot;.</p>
            <p className="text-zinc-400">Pressing translate on a locked message sends that one message to the translator. Messages are also kept on your own device so the app opens quickly.</p>
          </div>
        </div>

        <footer className="p-3 border-t border-zinc-800">
          <button type="button" onClick={onOpenSettings} className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer">
            <KeyRound className="w-4 h-4 text-[#00FF66]" /> My encryption keys &amp; backup
          </button>
        </footer>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------------------ my keys, devices and the backup
interface EncryptionSettingsModalProps {
  onClose: () => void;
  onRestored?: () => void;
}

const when = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const EncryptionSettingsModal: React.FC<EncryptionSettingsModalProps> = ({ onClose, onRestored }) => {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [restorePass, setRestorePass] = useState('');

  const refresh = useCallback(async () => setStatus(await e2ee.status()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (job: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ ok: true, text: await job() });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const saveBackup = () => run(async () => {
    if (pass !== pass2) throw new Error('The two passphrases are not the same.');
    await e2ee.saveBackup(pass);
    setPass(''); setPass2('');
    return 'Your key backup is saved. Keep the passphrase safe: nobody can recover it for you.';
  });
  const restore = () => run(async () => {
    const added = await e2ee.restoreBackup(restorePass);
    setRestorePass('');
    onRestored?.();
    return added > 0 ? 'Done. Older messages can now be opened on this device.' : 'Your backup was read. This device already had all of those keys.';
  });

  const input = 'w-full bg-black/60 text-xs text-white px-3 py-2.5 rounded-xl border border-zinc-700 outline-none focus:border-[#00FF66]/60';
  const btn = 'px-4 py-2.5 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Encryption keys and backup">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4 text-[#00FF66]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">Encryption keys &amp; backup</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">Your private chat key lives only on your devices. NOOB never has it.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-[12px] text-zinc-300 leading-relaxed">
          {!status ? (
            <p className="text-zinc-400">Loading…</p>
          ) : !status.available ? (
            <p>Chat encryption is not available on this device right now. (This can happen in a private browsing window, or before the app has finished updating.)</p>
          ) : (
            <>
              <section className="space-y-2">
                <div className="text-[11px] font-black text-white uppercase tracking-wider">My devices</div>
                {status.devices.map((d) => (
                  <div key={d.kid} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                    <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate" translate="no">
                        {d.label || 'Device'} {d.thisDevice && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/30 font-black uppercase">this device</span>}
                      </div>
                      <div className="text-[10px] text-zinc-500" translate="no">{d.kid.slice(0, 8)} · {when(d.createdAt)}{d.active ? '' : ' · switched off'}</div>
                    </div>
                    {!d.thisDevice && d.active && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(async () => { await e2ee.removeDevice(d.kid); return 'That device is switched off: new messages are no longer locked for it.'; })}
                        className="p-2 rounded-lg hover:bg-red-500/15 text-zinc-400 hover:text-red-400 cursor-pointer disabled:opacity-50"
                        title="Switch this device off"
                        aria-label="Switch this device off"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-zinc-500 text-[11px]">Switching a device off only stops NEW messages being locked for it. If a phone is lost or stolen, also change your password and log out everywhere.</p>
              </section>

              <section className="space-y-2">
                <div className="text-[11px] font-black text-white uppercase tracking-wider">Key backup</div>
                <p>
                  A new phone, or a cleared browser, can not read older messages unless it has your old keys. A backup keeps them, locked with a passphrase that only you know. Without a backup, older messages can not be recovered by anyone, including NOOB.
                </p>
                {status.hasBackup && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#00FF66]/30 bg-[#00FF66]/10 px-3 py-2 text-[#00FF66]">
                    <Check className="w-4 h-4 shrink-0" /> Backup saved {when(status.backupAt)}
                  </div>
                )}
                <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={status.hasBackup ? 'New passphrase (to update the backup)' : 'Choose a passphrase (10+ characters)'} className={input} />
                <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Type it again" className={input} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy || !pass} onClick={saveBackup} className={`${btn} bg-[#00FF66] text-black`}>{busy ? 'Working…' : status.hasBackup ? 'Update backup' : 'Create backup'}</button>
                  {status.hasBackup && (
                    <button type="button" disabled={busy} onClick={() => run(async () => { await e2ee.deleteBackup(); return 'The backup was deleted.'; })} className={`${btn} bg-zinc-900 border border-zinc-700 text-zinc-200`}>Delete backup</button>
                  )}
                </div>
                <p className="text-zinc-500 text-[11px]">Use a long phrase of several words that you do not use anywhere else. Anybody who gets the backup can try to guess the passphrase, so it is only as strong as the passphrase.</p>
              </section>

              {status.hasBackup && (
                <section className="space-y-2">
                  <div className="text-[11px] font-black text-white uppercase tracking-wider">Restore on this device</div>
                  <p>On a new device, enter your passphrase to open your older messages here.</p>
                  <input type="password" autoComplete="current-password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} placeholder="Your backup passphrase" className={input} />
                  <button type="button" disabled={busy || !restorePass} onClick={restore} className={`${btn} bg-zinc-900 border border-zinc-700 text-white`}>{busy ? 'Working…' : 'Restore keys'}</button>
                </section>
              )}
            </>
          )}

          {notice && (
            <div className={`rounded-xl border px-3 py-2 ${notice.ok ? 'border-[#00FF66]/30 bg-[#00FF66]/10 text-[#00FF66]' : 'border-red-500/40 bg-red-500/10 text-red-300'}`} role="status">{notice.text}</div>
          )}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1.5 text-[11px] text-zinc-400">
            <div className="text-[11px] font-black text-white">Honest limits</div>
            <p>NOOB can not read locked messages, but the app can not stop a server from lying about who owns a key. Comparing the security code in a chat with the other person is what proves nobody is in the middle.</p>
            <p>If somebody takes your unlocked phone, or gets your keys, they can read what those keys can open. This is not the &quot;keys change with every message&quot; design that Signal uses.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
