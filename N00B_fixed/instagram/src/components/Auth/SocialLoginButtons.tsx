import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchEnabledSocialProviders, signInWithProvider, type EnabledSocialProvider, type SocialProvider } from '../../services/api';

// "Continue with …" buttons. Only the providers that are switched on in the sign-in settings are shown, so a button appears
// by itself the moment its setup is finished — and never as a button that can only fail.

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.42-.22-2.04H12v3.86h6.56c-.13 1.09-.86 2.73-2.48 3.84l-.02.15 3.6 2.79.25.02c2.29-2.11 3.61-5.22 3.61-8.62z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.78-2.94c-1.02.71-2.4 1.21-4.15 1.21-3.17 0-5.86-2.1-6.82-5.03l-.14.01-3.73 2.9-.05.14C3.3 21.52 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.18 14.33a7.26 7.26 0 0 1-.39-2.33c0-.81.14-1.6.38-2.33l-.01-.16-3.78-2.94-.12.06A11.94 11.94 0 0 0 0 12c0 1.93.46 3.76 1.26 5.37z" />
    <path fill="#EA4335" d="M12 4.75c2.26 0 3.78.97 4.65 1.79l3.39-3.31C17.94 1.19 15.24 0 12 0 7.3 0 3.3 2.48 1.26 6.63l3.9 3.04c.98-2.93 3.67-4.92 6.84-4.92z" />
  </svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);
const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const META: Record<SocialProvider, { name: string; Icon: React.FC; className: string }> = {
  google: { name: 'Google', Icon: GoogleIcon, className: 'bg-white text-black ring-1 ring-black/10' },
  apple: { name: 'Apple', Icon: AppleIcon, className: 'bg-white text-black ring-1 ring-black/10' },
  discord: { name: 'Discord', Icon: DiscordIcon, className: 'bg-[#5865F2] force-white-text' },
  x: { name: 'X', Icon: XIcon, className: 'bg-[#0a0a0a] force-white-text ring-1 ring-white/20' }
};

interface Props {
  onError: (message: string | null) => void;
}

export const SocialLoginButtons: React.FC<Props> = ({ onError }) => {
  const [providers, setProviders] = useState<EnabledSocialProvider[]>([{ id: 'google', supabaseId: 'google' }]);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchEnabledSocialProviders().then((list) => { if (alive) setProviders(list); });
    return () => { alive = false; };
  }, []);

  const start = async (p: EnabledSocialProvider) => {
    setBusy(p.id);
    onError(null);
    const res = await signInWithProvider(p);
    if (!res.success) {
      setBusy(null);
      onError(res.error || 'Could not start sign-in. Please try again.');
    }
    // on success the page is about to redirect away — nothing further to do here
  };

  const google = providers.find((p) => p.id === 'google');
  const others = providers.filter((p) => p.id !== 'google');

  const button = (p: EnabledSocialProvider, wide: boolean) => {
    const m = META[p.id];
    return (
      <button
        key={p.id}
        type="button"
        disabled={busy !== null}
        onClick={() => void start(p)}
        aria-label={`Continue with ${m.name}`}
        className={`${m.className} w-full py-2.5 font-bold text-sm rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2.5`}
      >
        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <m.Icon />}
        <span className={wide ? '' : 'text-xs'}>{busy === p.id ? `Opening ${m.name}…` : wide ? `Continue with ${m.name}` : m.name}</span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {google && button(google, true)}
      {others.length > 0 && (
        <div className={`grid gap-2 ${others.length === 1 ? 'grid-cols-1' : others.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {others.map((p) => button(p, others.length === 1))}
        </div>
      )}
    </div>
  );
};
