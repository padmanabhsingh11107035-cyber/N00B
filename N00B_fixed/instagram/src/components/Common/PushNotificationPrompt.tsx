import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { fetchVapidPublicKey, subscribeToPush } from '../../services/api';

const DISMISSED_KEY = 'noob_push_prompt_seen';

// Browsers only ever show their OWN native permission prompt once per
// origin — if it's denied, calling requestPermission() again just returns
// "denied" instantly with no UI. So this custom, on-theme "soft ask" exists
// specifically to spend that one shot wisely: explain the value first, and
// only trigger the real native prompt after someone opts in here, instead
// of a bare browser dialog appearing out of nowhere on page load.
export function shouldShowPushPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'default') return false;
  try {
    if (localStorage.getItem(DISMISSED_KEY)) return false;
  } catch {
    // Private-browsing localStorage access can throw — treat as "not seen
    // yet" rather than crashing the prompt logic.
  }
  return true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface PushNotificationPromptProps {
  onDone: () => void;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ onDone }) => {
  const [loading, setLoading] = useState(false);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Ignore — worst case this prompt reappears next session.
    }
    onDone();
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        dismiss();
        return;
      }

      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) {
        dismiss();
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await subscribeToPush(subscription);
    } catch (err) {
      console.error('Failed to enable push notifications:', err);
    } finally {
      dismiss();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-xs bg-[#0e0e0e] border border-[#00FF66]/20 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
          <Bell className="w-7 h-7 text-[#00FF66]" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-white">Turn on notifications?</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Get notified about likes, comments, messages, and follow requests as they happen — even when NOOB isn't open.
          </p>
        </div>
        <button
          onClick={handleEnable}
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? 'Enabling…' : 'Turn on notifications'}
        </button>
        <button
          onClick={dismiss}
          disabled={loading}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 font-semibold cursor-pointer disabled:opacity-60"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
};
