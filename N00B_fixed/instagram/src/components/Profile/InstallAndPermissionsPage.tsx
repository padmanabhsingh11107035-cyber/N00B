import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Smartphone, Share, CheckCircle2, Bell, BellOff, Loader2 } from 'lucide-react';
import { User } from '../../types';
import {
  enablePushNotifications,
  disablePushNotifications,
  getPushDeviceState,
  getPushSupport,
  type PushDeviceState
} from '../Common/PushNotificationPrompt';
import { isIos, currentPushEnv } from '../../utils/pushSupport';
import { canInstallNow, isInstalled, onInstallStateChange, promptInstall } from '../../utils/pwaInstall';

interface InstallAndPermissionsPageProps {
  currentUser: User;
  onUserUpdated?: (user: User) => void;
  onClose: () => void;
}

export const InstallAndPermissionsPage: React.FC<InstallAndPermissionsPageProps> = ({ currentUser, onUserUpdated, onClose }) => {
  const [installAvailable, setInstallAvailable] = useState(canInstallNow());
  const [installed, setInstalled] = useState(isInstalled());
  const [installBusy, setInstallBusy] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  useEffect(
    () =>
      onInstallStateChange(() => {
        setInstallAvailable(canInstallNow());
        setInstalled(isInstalled());
      }),
    []
  );

  const onIos = useMemo(() => isIos(currentPushEnv()), []);

  const handleInstallClick = async () => {
    setInstallBusy(true);
    setInstallMessage(null);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') setInstallMessage('Added to your Home Screen.');
      else if (outcome === 'dismissed') setInstallMessage('Install cancelled — tap again anytime.');
      else setInstallMessage('Install isn’t available right now. Try your browser’s own menu instead.');
    } finally {
      setInstallBusy(false);
    }
  };

  // ---- Notifications (same subscribe pipeline used by the soft-ask prompt on first launch) ----
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushDeviceState>(currentUser.pushSubscription ? 'on' : 'off');
  const pushSupport = useMemo(() => getPushSupport(), []);

  useEffect(() => {
    let alive = true;
    getPushDeviceState().then((state) => {
      if (alive) setPushState(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleToggleNotifications = async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    setNotifMessage(null);
    try {
      if (pushState === 'on') {
        const ok = await disablePushNotifications();
        if (ok) {
          setPushState('off');
          onUserUpdated?.({ ...currentUser, pushSubscription: undefined });
        } else {
          setNotifMessage('Couldn’t switch notifications off. Check your connection and try again.');
        }
      } else {
        const result = await enablePushNotifications();
        if (result.status === 'granted' && result.subscription) {
          setPushState('on');
          onUserUpdated?.({ ...currentUser, pushSubscription: result.subscription });
        } else if (result.status === 'denied') {
          setNotifMessage('Notifications are blocked for this site. Tap the lock icon next to the address, allow Notifications for nooob.xyz, then try again.');
        } else if (result.status === 'unsupported') {
          setNotifMessage(result.message || 'This browser cannot show notifications.');
        } else if (result.status === 'error') {
          setNotifMessage(
            result.reason === 'not-set-up'
              ? 'Notifications aren’t switched on at the server yet. The NOOB admin needs to finish setting them up.'
              : result.reason === 'save'
                ? 'Couldn’t save this setting. Check your connection and try again.'
                : 'Your browser couldn’t turn notifications on. Try again, or check this site’s notification settings.'
          );
        }
      }
    } finally {
      setNotifBusy(false);
    }
  };

  const notifHint =
    notifMessage ||
    (pushSupport.supported === false
      ? pushSupport.message
      : pushState === 'other-device'
        ? 'Turned on for another device. Tap to get them on this one instead.'
        : null);

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FF66]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-cyan-600/10 blur-[110px]" />

      <div className="relative z-10 flex items-center gap-3 p-4 sm:p-5 border-b border-white/10 shrink-0">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer" aria-label="Back">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black tracking-tight">Install and Permissions</h1>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="w-full max-w-sm mx-auto space-y-5">
          {/* Install App */}
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/30 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-[#00FF66]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Install App</h2>
                <p className="text-[11px] text-zinc-400">Add NOOB to your Home Screen</p>
              </div>
            </div>

            {installed ? (
              <div className="flex items-center gap-2 text-xs text-[#00FF66] font-semibold bg-[#00FF66]/10 border border-[#00FF66]/25 rounded-xl px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                NOOB is already installed on this device.
              </div>
            ) : installAvailable ? (
              <button
                onClick={handleInstallClick}
                disabled={installBusy}
                className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {installBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {installBusy ? 'Installing…' : 'Add to Home Screen'}
              </button>
            ) : onIos ? (
              <div className="space-y-2.5">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  iPhone and iPad don’t let any app trigger this automatically — Apple only allows it from Safari’s own Share menu. It’s two taps:
                </p>
                <ol className="text-xs text-zinc-200 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">1</span>
                    <span className="flex items-center gap-1.5">
                      Tap <Share className="w-3.5 h-3.5 text-sky-400" /> <b>Share</b> in Safari’s toolbar
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>
                      Tap <b>Add to Home Screen</b>, then <b>Add</b>
                    </span>
                  </li>
                </ol>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Open NOOB in Chrome, Edge or Samsung Internet to install with one tap. If the button above doesn’t appear, use your browser’s own menu → “Install app” or “Add to Home Screen.”
              </p>
            )}

            {installMessage && <p className="text-[11px] text-amber-300/90">{installMessage}</p>}
          </div>

          {/* Notifications */}
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                {pushState === 'on' ? <Bell className="w-5 h-5 text-cyan-400" /> : <BellOff className="w-5 h-5 text-cyan-400" />}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Notifications</h2>
                <p className="text-[11px] text-zinc-400">Likes, comments, messages &amp; follows</p>
              </div>
            </div>

            <button
              onClick={handleToggleNotifications}
              disabled={notifBusy}
              className={`w-full py-3 text-xs font-bold rounded-2xl cursor-pointer transition-opacity disabled:opacity-60 ${
                pushState === 'on'
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700'
                  : 'bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black hover:opacity-90'
              }`}
            >
              {notifBusy ? 'Updating…' : pushState === 'on' ? 'Turn Off Notifications' : 'Turn on Notifications'}
            </button>

            {notifHint && <p className="text-[11px] text-amber-300/90 leading-relaxed">{notifHint}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
