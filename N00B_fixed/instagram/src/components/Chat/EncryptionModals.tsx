import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Eye, KeyRound, Lock, LockOpen, Smartphone, Trash2, Unlock } from 'lucide-react';
import { e2ee } from '../../services/api';
import type { ChatCrypto, KeyStatus } from '../../e2ee/service.ts';
import './premium.css';

// Full-screen pages (their look lives in premium.css: midnight ink and champagne gold, not the app's own black and white).

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
    <div className="pm-root fixed inset-0 edge-own z-[125]" role="dialog" aria-modal="true" aria-label="Chat encryption" data-testid="chat-encryption-page">
      <div className="pm-top">
        <button type="button" onClick={onClose} className="pm-back" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="pm-top-text">
          <h3 className="pm-title">Chat privacy</h3>
          <p className="pm-sub" translate="no">{title}</p>
        </div>
      </div>

      <div className="pm-body">
        <div className="pm-col">
          <div className="pm-hero">
            <div className={`pm-hero-icon ${locked ? '' : 'warn'}`}>{locked ? <Lock size={34} /> : <LockOpen size={34} />}</div>
            <h2 className="pm-h1">{locked ? 'This chat is end-to-end encrypted' : 'This chat is not encrypted'}</h2>
            <p className="pm-lead">
              {locked
                ? 'Messages here are locked on your device and only opened on the devices of the people in this chat. Nobody else can read them, not even NOOB’s servers.'
                : info ? reasonText(info) : 'Checking…'}
            </p>
          </div>

          {locked && info?.peer?.changed && (
            <div className="pm-notice warn" style={{ display: 'flex', gap: 12 }}>
              <AlertTriangle size={20} style={{ flex: 'none', marginTop: 2 }} />
              <div className="pm-stack">
                <span><span translate="no">@{info.peer.username}</span>&apos;s security code has changed. This usually means they started using a new phone or browser. If you want to be sure, compare the new code with them.</span>
                <button type="button" onClick={onAcknowledge} className="pm-btn ghost" style={{ alignSelf: 'flex-start', minHeight: 40 }}>Got it</button>
              </div>
            </div>
          )}

          {locked && info?.peer && (
            <section>
              <p className="pm-eyebrow">Security code</p>
              <div className="pm-code" translate="no" dir="ltr">{groups.map((g, i) => <span key={i}>{g}</span>)}</div>
              <p className="pm-muted" style={{ marginTop: 8 }}>
                Compare this number with <span translate="no">@{info.peer.username}</span> in person or on a call. If it is exactly the same on both phones, nobody is listening in the middle.
              </p>
            </section>
          )}

          <section>
            <p className="pm-eyebrow">What is locked, and what is not</p>
            <div className="pm-card">
              <div className="pm-row">
                <span className="pm-dot"><Lock size={16} /></span>
                <div className="pm-row-text"><p className="pm-row-title">Locked</p><p className="pm-row-desc">Text messages, replies, edits, GIFs and stickers, and photos, videos and voice notes.</p></div>
              </div>
              <div className="pm-row">
                <span className="pm-dot warn"><Unlock size={16} /></span>
                <div className="pm-row-text"><p className="pm-row-title">Not locked yet</p><p className="pm-row-desc">Shared music, shared posts and game invites are stored normally.</p></div>
              </div>
              <div className="pm-row">
                <span className="pm-dot dim"><Eye size={16} /></span>
                <div className="pm-row-text"><p className="pm-row-title">Still visible to NOOB</p><p className="pm-row-desc">Who is in a chat and when messages are sent. Notifications only say &quot;New message&quot;.</p></div>
              </div>
            </div>
            <p className="pm-muted" style={{ marginTop: 10 }}>Pressing translate on a locked message sends that one message to the translator. Messages are also kept on your own device so the app opens quickly.</p>
          </section>
        </div>
      </div>

      <div className="pm-foot">
        <div className="pm-foot-in">
          <button type="button" onClick={onOpenSettings} className="pm-btn gold"><KeyRound size={18} /> My encryption keys &amp; backup</button>
        </div>
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

  return (
    <div className="pm-root fixed inset-0 edge-own z-[130]" role="dialog" aria-modal="true" aria-label="Encryption keys and backup" data-testid="encryption-keys-page">
      <div className="pm-top">
        <button type="button" onClick={onClose} className="pm-back" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="pm-top-text">
          <h3 className="pm-title">Keys &amp; backup</h3>
          <p className="pm-sub">Your private chat key lives only on your devices.</p>
        </div>
      </div>

      <div className="pm-body">
        <div className="pm-col">
          <div className="pm-hero">
            <div className="pm-hero-icon"><KeyRound size={34} /></div>
            <h2 className="pm-h1">Your chat keys</h2>
            <p className="pm-lead">NOOB never has your private key. A backup lets a new phone open your older messages.</p>
          </div>

          {!status ? (
            <p className="pm-muted" style={{ textAlign: 'center' }}>Loading&hellip;</p>
          ) : !status.available ? (
            <div className="pm-notice warn">Chat encryption is not available on this device right now. (This can happen in a private browsing window, or before the app has finished updating.)</div>
          ) : (
            <>
              <section>
                <p className="pm-eyebrow">Chat key devices</p>
                <div className="pm-card">
                  {status.devices.filter((d) => d.active).map((d) => (
                    <div key={d.kid} className="pm-device">
                      <span className="pm-dot dim"><Smartphone size={16} /></span>
                      <div className="pm-row-text">
                        <p className="pm-row-title" translate="no" style={{ overflowWrap: 'anywhere' }}>{d.label || 'Device'}{d.thisDevice && <span className="pm-badge">this device</span>}</p>
                        <p className="pm-muted" translate="no" style={{ margin: 0 }}>{d.kid.slice(0, 8)} &middot; {when(d.createdAt)}</p>
                      </div>
                      {!d.thisDevice && d.active && (
                        <button type="button" disabled={busy} onClick={() => run(async () => { await e2ee.removeDevice(d.kid); return 'That device is switched off: new messages are no longer locked for it.'; })} className="pm-icon-btn" title="Switch this device off" aria-label="Switch this device off"><Trash2 size={18} /></button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="pm-muted" style={{ marginTop: 8 }}>Switching a device off only stops NEW messages being locked for it. If a phone is lost or stolen, also change your password and log out everywhere.</p>
              </section>

              <section>
                <p className="pm-eyebrow">Key backup</p>
                <div className="pm-card pm-stack">
                  <p style={{ color: '#c3c1d4' }}>A new phone, or a cleared browser, can not read older messages unless it has your old keys. A backup keeps them, locked with a passphrase that only you know. Without a backup, older messages can not be recovered by anyone, including NOOB.</p>
                  {status.hasBackup && <div className="pm-notice" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Check size={18} /> Backup saved {when(status.backupAt)}</div>}
                  <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={status.hasBackup ? 'New passphrase (to update the backup)' : 'Choose a passphrase (10+ characters)'} className="pm-input" />
                  <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Type it again" className="pm-input" />
                  <div className="pm-btns">
                    <button type="button" disabled={busy || !pass} onClick={saveBackup} className="pm-btn gold">{busy ? 'Working…' : status.hasBackup ? 'Update backup' : 'Create backup'}</button>
                    {status.hasBackup && <button type="button" disabled={busy} onClick={() => run(async () => { await e2ee.deleteBackup(); return 'The backup was deleted.'; })} className="pm-btn danger">Delete backup</button>}
                  </div>
                  <p className="pm-muted">Use a long phrase of several words that you do not use anywhere else. Anybody who gets the backup can try to guess the passphrase, so it is only as strong as the passphrase.</p>
                </div>
              </section>

              {status.hasBackup && (
                <section>
                  <p className="pm-eyebrow">Restore on this device</p>
                  <div className="pm-card pm-stack">
                    <p style={{ color: '#c3c1d4' }}>On a new device, enter your passphrase to open your older messages here.</p>
                    <input type="password" autoComplete="current-password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} placeholder="Your backup passphrase" className="pm-input" />
                    <button type="button" disabled={busy || !restorePass} onClick={restore} className="pm-btn ghost block">{busy ? 'Working…' : 'Restore keys'}</button>
                  </div>
                </section>
              )}
            </>
          )}

          {notice && <div className={`pm-notice ${notice.ok ? '' : 'bad'}`} role="status">{notice.text}</div>}

          <section>
            <p className="pm-eyebrow">Honest limits</p>
            <div className="pm-card pm-muted">
              <p>NOOB can not read locked messages, but the app can not stop a server from lying about who owns a key. Comparing the security code in a chat with the other person is what proves nobody is in the middle.</p>
              <p>If somebody takes your unlocked phone, or gets your keys, they can read what those keys can open. This is not the &quot;keys change with every message&quot; design that Signal uses.</p>
            </div>
          </section>
        </div>
      </div>

      <div className="pm-foot">
        <div className="pm-foot-in"><button type="button" onClick={onClose} className="pm-btn gold">Done</button></div>
      </div>
    </div>
  );
};
