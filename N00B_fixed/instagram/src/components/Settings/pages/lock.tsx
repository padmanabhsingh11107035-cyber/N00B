import React, { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, ScanFace, ShieldCheck } from 'lucide-react';
import { PageShell, Section, Row, ToggleRow, Choice, Note, SmallButton, useFlash } from '../kit';
import type { PageProps } from '../types';
import { verifyMyPassword } from '../../../services/api';
import { LOCK_PAGES, loadLock, lockSupported, registerLock, removeLock, subscribeLock, updateLock, verifyFace, type LockConfig, type LockPage } from '../../../utils/appLock';

// App lock: Face ID / fingerprint on this phone, asked before NOOB opens, whenever it comes back, or before chosen pages. The account's password is asked first (to set it up and to
// turn it off). What the lock is, and is not, is written on the page (see utils/appLock.ts).

const GRACE: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Every time' },
  { value: '60', label: 'After 1 min away' },
  { value: '300', label: 'After 5 min away' },
];

export const AppLockPage: React.FC<PageProps> = ({ ctx, back }) => {
  const user = ctx.currentUser;
  const [config, setConfig] = useState<LockConfig | null>(() => loadLock(user.id));
  const [supported, setSupported] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'start' | 'password' | 'face'>('start');
  const [busy, setBusy] = useState(false);
  const [flash, show] = useFlash();
  useEffect(() => { void lockSupported().then(setSupported); }, []);
  useEffect(() => subscribeLock(() => setConfig(loadLock(user.id))), [user.id]);

  const input = 'w-full bg-zinc-900 border border-white/15 focus:border-white/50 rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500';
  const checkPassword = async (): Promise<boolean> => {
    setBusy(true);
    const res = await verifyMyPassword(user.username, password);
    setBusy(false);
    if (!res.ok) { show(res.error || 'Incorrect password.', 'bad'); return false; }
    setPassword('');
    return true;
  };
  const register = async () => {
    setBusy(true);
    const res = await registerLock(user.id, user.username);
    setBusy(false);
    if (res.ok === true) { setStep('start'); show('Face lock is on for this phone. NOOB will ask for it when you open the app.', 'good'); } else show((res as { error: string }).error, 'bad');
  };
  const patch = (p: Parameters<typeof updateLock>[1]) => { setConfig(updateLock(user.id, p)); };
  const togglePage = (id: LockPage, on: boolean) => {
    if (!config) return;
    patch({ pages: on ? [...config.pages, id] : config.pages.filter((x) => x !== id) });
  };
  const turnOff = async () => {
    if (!(await checkPassword())) return;
    removeLock(user.id);
    setConfig(null); setStep('start');
    show('Face lock is off.', 'good');
  };
  const testIt = async () => { setBusy(true); const ok = await verifyFace(user.id); setBusy(false); show(ok ? 'It worked: the phone recognised you.' : 'Not recognised.', ok ? 'good' : 'bad'); };

  return (
    <PageShell title="App lock" subtitle="Face ID, fingerprint or phone code" onBack={back}>
      {flash}
      {supported === false && <Note tone="bad">This phone or browser has no Face ID, fingerprint or screen lock that NOOB can use. Set one up in the phone’s own settings, then come back. (On iPhone, open NOOB from the Home Screen icon.)</Note>}

      {!config && supported !== false && (
        <Section title="Set up" note="You type your password once, then the phone asks for your face (or finger) to register this phone.">
          {step === 'start' && (
            <Row icon={ScanFace} label="Turn on face lock" sub="Asks for your password first" onClick={() => setStep('password')} testId="applock-start" />
          )}
          {step === 'password' && (
            <div className="p-4 space-y-3">
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your NOOB password" aria-label="Your NOOB password" className={input} />
              <button type="button" disabled={busy || !password} onClick={async () => { if (await checkPassword()) setStep('face'); }} className="w-full py-3 rounded-full bg-white text-black text-sm font-extrabold disabled:opacity-40 cursor-pointer">{busy ? 'Checking…' : 'Continue'}</button>
            </div>
          )}
          {step === 'face' && (
            <div className="p-4 space-y-3">
              <p className="text-[12px] text-zinc-400">Password correct. Now look at your phone (or touch the sensor) when it asks.</p>
              <button type="button" disabled={busy} onClick={register} className="w-full py-3 rounded-full bg-white text-black text-sm font-extrabold disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2" data-testid="applock-register"><ScanFace className="w-4 h-4" /> {busy ? 'Waiting for the phone…' : 'Register my face'}</button>
            </div>
          )}
        </Section>
      )}

      {config && (
        <>
          <Section title="When to ask" note="One check opens everything until you leave NOOB for longer than the time you pick.">
            <ToggleRow icon={ScanFace} label="When I open NOOB" sub="Every fresh start of the app" on={config.open || config.whole} onChange={(on) => patch({ open: on, whole: on ? config.whole : false })} testId="applock-open" />
            <ToggleRow icon={ShieldCheck} label="Lock the whole app" sub="Also when I come back to it from another app" on={config.whole} onChange={(on) => patch({ whole: on, open: on ? true : config.open })} testId="applock-whole" />
            {(config.whole || config.pages.length > 0) && (
              <div className="p-4 space-y-2">
                <p className="text-[12px] text-zinc-400">Ask again</p>
                <Choice value={String(config.graceSeconds)} onChange={(v) => patch({ graceSeconds: Number(v) })} options={GRACE} />
              </div>
            )}
          </Section>
          <Section title="Lock single pages" note="Only these pages ask, even when the whole app is not locked.">
            {LOCK_PAGES.map((p) => (
              <ToggleRow key={p.id} label={p.label} on={config.pages.includes(p.id)} onChange={(on) => togglePage(p.id, on)} disabled={config.whole} testId={`applock-page-${p.id}`} />
            ))}
            {config.whole && <p className="px-4 pb-3 text-[11px] text-zinc-500">The whole app is locked, so every page is already covered.</p>}
          </Section>
          <Section title="This phone">
            <Row icon={Fingerprint} label="Try it now" sub="Checks that the phone recognises you" onClick={testIt} chevron={false} disabled={busy} />
            <div className="p-4 space-y-3">
              <p className="text-[12px] text-zinc-400">To turn the lock off, type your password.</p>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your NOOB password" aria-label="Your NOOB password" className={input} />
              <SmallButton tone="danger" onClick={turnOff} disabled={busy || !password}>Turn off face lock</SmallButton>
            </div>
          </Section>
        </>
      )}

      <Section title="What this is">
        <div className="p-4 space-y-2 text-[12px] leading-relaxed text-zinc-400">
          <p><KeyRound className="inline w-3.5 h-3.5 mr-1" />The check is done by your phone. NOOB never sees or keeps your face or fingerprint, only the phone’s “yes”, which it checks with a key made at set-up.</p>
          <p>A website can’t look at faces itself, so “my face” means the face (or finger) saved in the phone’s own settings. Anyone else saved there can open NOOB too.</p>
          <p>The lock belongs to this phone only. It is made to stop somebody who picks your phone up, not to stop a person with developer tools on an unlocked, logged-in browser.</p>
        </div>
      </Section>
    </PageShell>
  );
};
