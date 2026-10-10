import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchEnabledSocialProviders, signInWithProvider, type EnabledSocialProvider, type SocialProvider } from '../../services/api';

// "Continue with …" buttons. Only the providers that are switched on in the sign-in settings are shown, so a button appears
// by itself the moment its setup is finished — and never as a button that can only fail.

type IconProps = { className?: string };

const GoogleIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.42-.22-2.04H12v3.86h6.56c-.13 1.09-.86 2.73-2.48 3.84l-.02.15 3.6 2.79.25.02c2.29-2.11 3.61-5.22 3.61-8.62z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.78-2.94c-1.02.71-2.4 1.21-4.15 1.21-3.17 0-5.86-2.1-6.82-5.03l-.14.01-3.73 2.9-.05.14C3.3 21.52 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.18 14.33a7.26 7.26 0 0 1-.39-2.33c0-.81.14-1.6.38-2.33l-.01-.16-3.78-2.94-.12.06A11.94 11.94 0 0 0 0 12c0 1.93.46 3.76 1.26 5.37z" />
    <path fill="#EA4335" d="M12 4.75c2.26 0 3.78.97 4.65 1.79l3.39-3.31C17.94 1.19 15.24 0 12 0 7.3 0 3.3 2.48 1.26 6.63l3.9 3.04c.98-2.93 3.67-4.92 6.84-4.92z" />
  </svg>
);
const AppleIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);
const DiscordIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
  </svg>
);
const XIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const FacebookIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
  </svg>
);
const MicrosoftIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#F25022" d="M1 1h10v10H1z" />
    <path fill="#7FBA00" d="M13 1h10v10H13z" />
    <path fill="#00A4EF" d="M1 13h10v10H1z" />
    <path fill="#FFB900" d="M13 13h10v10H13z" />
  </svg>
);
const GitHubIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);
const LinkedInIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);
const TwitchIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);
const SpotifyIcon: React.FC<IconProps> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const META: Record<SocialProvider, { name: string; Icon: React.FC<IconProps>; className: string }> = {
  google: { name: 'Google', Icon: GoogleIcon, className: 'bg-white text-black ring-1 ring-black/10' },
  apple: { name: 'Apple', Icon: AppleIcon, className: 'bg-white text-black ring-1 ring-black/10' },
  facebook: { name: 'Facebook', Icon: FacebookIcon, className: 'bg-[#1877F2] force-white-text' },
  microsoft: { name: 'Microsoft', Icon: MicrosoftIcon, className: 'bg-white text-black ring-1 ring-black/10' },
  x: { name: 'X', Icon: XIcon, className: 'bg-[#0a0a0a] force-white-text ring-1 ring-white/20' },
  discord: { name: 'Discord', Icon: DiscordIcon, className: 'bg-[#5865F2] force-white-text' },
  github: { name: 'GitHub', Icon: GitHubIcon, className: 'bg-[#24292f] force-white-text ring-1 ring-white/20' },
  linkedin: { name: 'LinkedIn', Icon: LinkedInIcon, className: 'bg-[#0A66C2] force-white-text' },
  twitch: { name: 'Twitch', Icon: TwitchIcon, className: 'bg-[#9146FF] force-white-text' },
  spotify: { name: 'Spotify', Icon: SpotifyIcon, className: 'bg-[#1DB954] text-black' }
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

  // Every provider is a full-width "Continue with …" button, one under the other (Google first).
  const button = (p: EnabledSocialProvider) => {
    const m = META[p.id];
    const label = `Continue with ${m.name}`;
    return (
      <button
        key={p.id}
        type="button"
        disabled={busy !== null}
        onClick={() => void start(p)}
        aria-label={label}
        className={`${m.className} w-full py-2.5 font-bold text-sm rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2.5`}
      >
        {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <m.Icon className="w-4 h-4" />}
        <span>{busy === p.id ? `Opening ${m.name}…` : label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {google && button(google)}
      {others.map((p) => button(p))}
    </div>
  );
};