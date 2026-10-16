import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useNativeUpdate } from '../../services/nativeUpdate';

// In the Android app only: when a new app file is ready (something native changed, so the website alone can not bring it) a bar at the top offers "Update". One tap downloads
// it and opens Android's installer. Ordinary changes never need this: the app shows the live website, so they arrive by themselves.
export const NativeUpdateBanner: React.FC = () => {
  const u = useNativeUpdate();
  if (!u.native || u.checking || u.info?.state !== 'newer') return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[101] flex justify-center px-3 pt-3 pointer-events-none" data-testid="native-update-banner">
      <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-white/30 bg-zinc-950/98 shadow-2xl shadow-black p-3.5 flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-2xl border border-white/25 bg-zinc-900 flex items-center justify-center text-white"><Download className="w-5 h-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-white leading-tight">A new NOOB app is ready</span>
          <span className="block text-[11.5px] text-zinc-400 leading-snug mt-0.5">{u.message || 'One tap installs it. Your account and chats stay as they are.'}</span>
        </span>
        <button type="button" onClick={() => void u.install()} disabled={u.busy} className="shrink-0 inline-flex items-center justify-center min-w-[4.5rem] px-4 py-2 rounded-full bg-white text-black text-xs font-extrabold active:scale-95 transition-transform touch-manipulation cursor-pointer disabled:opacity-70">
          {u.busy ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Working" /> : 'Update'}
        </button>
      </div>
    </div>
  );
};
