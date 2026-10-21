import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { canInstallNow, chromeInstallUrl, isInstalled, isSamsungInternet, onInstallStateChange, promptInstall } from '../../utils/pwaInstall';
import { currentPushEnv, isIos } from '../../utils/pushSupport';
import { isNativeApp, isOnOtherNoobAddress } from '../../utils/siteUrl';

// The "Install NOOB" card of the new address: it opens full screen when a page is opened with ?install=1 (the Install button of the old address's
// "new home" card, the Install button of the reminder email), so the person does not have to look for a button. A browser only shows its install dialog after a
// tap on the page that is being installed, so the card has one big button and that tap opens the real install dialog (Chrome, Edge and friends; Samsung Internet
// is sent to Chrome, iPhone gets the two Safari steps). From the old address (&from=old) it also says how to remove the old app, because a website cannot
// remove an installed app by itself — that is the person's own action, after they have logged in on the new one and checked their chats.
export function readInvite(search: string): { fromOld: boolean } | null {
  try {
    const p = new URLSearchParams(search);
    return p.get('install') === '1' ? { fromOld: p.get('from') === 'old' } : null;
  } catch { return null; }
}

// read once, when the page starts: the login screen takes ?install=1 off the address bar a moment later
const INVITE = typeof window !== 'undefined' ? readInvite(window.location.search) : null;

export const InstallInvite: React.FC = () => {
  const [open, setOpen] = useState(() => !!INVITE && !isNativeApp() && !isOnOtherNoobAddress() && !isInstalled());
  const [canInstall, setCanInstall] = useState(canInstallNow());
  const [state, setState] = useState<'idle' | 'busy' | 'accepted' | 'dismissed' | 'unavailable'>('idle');
  const [waited, setWaited] = useState(false);
  const onIos = useMemo(() => isIos(currentPushEnv()), []);
  const onSamsung = useMemo(() => isSamsungInternet(), []);

  useEffect(() => onInstallStateChange(() => setCanInstall(canInstallNow())), []);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('from')) {
        params.delete('from');
        const q = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
      }
    } catch { /* no address bar to read: nothing to do */ }
    const t = window.setTimeout(() => setWaited(true), 5000);
    return () => window.clearTimeout(t);
  }, []);

  if (!open || !INVITE) return null;

  const install = async () => {
    if (onSamsung) { window.location.href = chromeInstallUrl(window.location.origin + '/'); return; }
    if (!canInstall) return;
    setState('busy');
    setState(await promptInstall());
  };

  const done = state === 'accepted';
  const noButton = !onIos && !onSamsung && !canInstall && waited && state !== 'accepted';
  let hint: string | null = null;
  if (onIos) hint = 'Tap the Share button in Safari’s toolbar, then tap "Add to Home Screen".';
  else if (state === 'dismissed') hint = 'No problem. You can also open your browser’s menu and tap "Install app" or "Add to Home screen".';
  else if (state === 'unavailable' || noButton) hint = 'Your browser did not offer the install button. Open its menu (the three dots) and tap "Install app" or "Add to Home screen".';
  else if (onSamsung) hint = 'This opens Chrome, which installs NOOB safely.';

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Install NOOB" data-testid="install-invite">
      <div
        className="force-white-text relative w-[min(92vw,380px)] max-h-[92vh] overflow-y-auto no-scrollbar rounded-[30px] ring-1 ring-white/60 shadow-[0_0_0_6px_rgba(255,255,255,.06),0_28px_70px_-10px_rgba(0,0,0,.95)] px-7 pt-8 pb-6 text-center"
        style={{ backgroundColor: '#000000', color: '#ffffff' }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-[24px] border border-dashed border-white/35" />
        <img src="/noob-logo-circle.png" alt="" width={72} height={72} className="relative z-10 mx-auto w-[72px] h-[72px] rounded-[24%]" />
        {done ? (
          <>
            <h2 className="relative z-10 mt-4 text-[22px] font-extrabold tracking-tight">NOOB is on your phone</h2>
            <p className="relative z-10 mt-2 text-[13.5px] leading-snug text-white/80">Open NOOB from your home screen and log in with the same account. Everything is there.</p>
            {INVITE.fromOld && (
              <p className="relative z-10 mt-3 text-[12.5px] leading-snug text-white/65">
                Once you are logged in and your chats open, remove the old NOOB app, the one that showed "We have a new home": touch and hold its icon, then tap Uninstall (iPhone: Remove App).
              </p>
            )}
            <button type="button" onClick={() => setOpen(false)} className="relative z-10 mt-5 w-full rounded-full py-3 text-sm font-extrabold cursor-pointer active:scale-[.98]" style={{ backgroundColor: '#ffffff', color: '#000000' }}>Done</button>
          </>
        ) : (
          <>
            <h2 className="relative z-10 mt-4 text-[22px] font-extrabold tracking-tight">Install NOOB</h2>
            <p className="relative z-10 mt-2 text-[13.5px] leading-snug text-white/80">
              {onIos ? 'Add NOOB to your home screen in two taps.' : 'One tap, then tap Install. NOOB opens from your home screen like any other app.'}
            </p>
            {!onIos && !noButton && (
              <button
                type="button"
                onClick={install}
                disabled={state === 'busy' || (!canInstall && !onSamsung)}
                className="relative z-10 mt-5 w-full inline-flex items-center justify-center gap-2.5 rounded-full py-3.5 text-[15px] font-extrabold cursor-pointer transition-transform hover:scale-[1.02] active:scale-[.98] disabled:opacity-70 disabled:cursor-default"
                style={{ backgroundColor: '#ffffff', color: '#000000' }}
              >
                {state === 'busy' || (!canInstall && !onSamsung && !noButton) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{!canInstall && !onSamsung && !noButton ? 'Getting ready...' : 'Install NOOB'}</span>
              </button>
            )}
            {hint && <p className="relative z-10 mt-4 text-[12.5px] leading-snug text-white/70">{hint}</p>}
            <button type="button" onClick={() => setOpen(false)} className="relative z-10 mt-4 text-xs text-white/55 underline underline-offset-4 cursor-pointer">Not now</button>
          </>
        )}
      </div>
    </div>
  );
};
