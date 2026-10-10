import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

// "Sign-in" page of the admin panel: one tab per "Continue with …" provider, each with every link needed to change it later
// (the provider's own console, Supabase, copy-paste values, and what to do when something stops working).
// It never shows or stores a secret: client secrets live only in Supabase → Authentication → Providers.

type ProviderId = 'google' | 'facebook' | 'discord';

interface LinkItem { label: string; hint: string; href: string }
interface LinkGroup { title: string; links: LinkItem[] }
interface ValueItem { label: string; value: string }
interface Guide {
  id: ProviderId;
  name: string;
  intro: string;
  groups: LinkGroup[];
  values: ValueItem[];
  fixes: Array<[string, string]>;
}

const SUPABASE_PROJECT = 'https://supabase.com/dashboard/project/abffssydapumuhwgzeck';
const CALLBACK_URL = 'https://abffssydapumuhwgzeck.supabase.co/auth/v1/callback';
const FACEBOOK_APP_ID = '1834642197690870';
const DISCORD_APP_ID = '1558372822504701972';
const FB = `https://developers.facebook.com/apps/${FACEBOOK_APP_ID}`;
const DC = `https://discord.com/developers/applications/${DISCORD_APP_ID}`;

const supabaseGroup = (provider: string): LinkGroup => ({
  title: 'In Supabase (where the sign-in is switched on and the secret is kept)',
  links: [
    { label: `${provider} provider settings`, hint: 'Switch it on or off, change the Client ID or the Client Secret', href: `${SUPABASE_PROJECT}/auth/providers` },
    { label: 'Sign-in logs', hint: 'See why a login failed (errors show up here first)', href: `${SUPABASE_PROJECT}/logs/auth-logs` },
    { label: 'Users', hint: 'Every login identity (Google, Facebook, Discord…) and when it last signed in', href: `${SUPABASE_PROJECT}/auth/users` },
    { label: 'recover-account function', hint: 'The code that logs people into their existing NOOB account (redeploy after any change)', href: `${SUPABASE_PROJECT}/functions/recover-account` }
  ]
});

const publicPages: ValueItem[] = [
  { label: 'Home page', value: 'https://nooob.xyz' },
  { label: 'Privacy policy URL', value: 'https://nooob.xyz/privacy.html' },
  { label: 'Terms of service URL', value: 'https://nooob.xyz/terms.html' },
  { label: 'Data deletion instructions URL', value: 'https://nooob.xyz/data-deletion.html' }
];

const GUIDES: Guide[] = [
  {
    id: 'google',
    name: 'Google',
    intro: 'Google Cloud project for "Continue with Google". The name and logo people see on Google\'s screen come from Branding; it must stay published and verified.',
    groups: [
      supabaseGroup('Google'),
      {
        title: 'In Google Cloud Console (Google Auth Platform)',
        links: [
          { label: 'Overview', hint: 'The project\'s sign-in status at a glance', href: 'https://console.cloud.google.com/auth/overview' },
          { label: 'Branding', hint: 'App name, logo, home page, privacy and terms links', href: 'https://console.cloud.google.com/auth/branding' },
          { label: 'Clients', hint: 'The OAuth client: Client ID, secrets, authorized redirect URI', href: 'https://console.cloud.google.com/auth/clients' },
          { label: 'Audience', hint: 'Must say "In production" so everyone can sign in (not "Testing")', href: 'https://console.cloud.google.com/auth/audience' },
          { label: 'Verification centre', hint: 'Brand verification status and anything Google asks for', href: 'https://console.cloud.google.com/auth/verification' },
          { label: 'Data access', hint: 'The information NOOB asks for (email, profile)', href: 'https://console.cloud.google.com/auth/scopes' }
        ]
      },
      {
        title: 'Domain ownership (needed for the verified brand)',
        links: [
          { label: 'Google Search Console', hint: 'Shows that nooob.xyz is verified as yours', href: 'https://search.google.com/search-console' },
          { label: 'Cloudflare dashboard', hint: 'Where the domain\'s DNS records live', href: 'https://dash.cloudflare.com/' }
        ]
      }
    ],
    values: [{ label: 'Authorized redirect URI (Clients → the web client)', value: CALLBACK_URL }, ...publicPages],
    fixes: [
      ['Google says "redirect_uri_mismatch"', 'Open Clients → the web client → Authorized redirect URIs must contain the redirect URI below, exactly.'],
      ['Google\'s screen shows the Supabase address instead of NOOB', 'Open Branding and the Verification centre: the branding has to be published and verified.'],
      ['Only some people can sign in', 'Open Audience: it must say "In production", not "Testing".'],
      ['A client secret leaked or must be replaced', 'Clients → the web client → add a new secret, paste it into Supabase → Providers → Google, then disable the old one.']
    ]
  },
  {
    id: 'facebook',
    name: 'Facebook',
    intro: `Meta app "NOOB" (App ID ${FACEBOOK_APP_ID}) with the "Authenticate and request data from users with Facebook Login" use case. NOOB asks Facebook only for name, picture and email.`,
    groups: [
      supabaseGroup('Facebook'),
      {
        title: 'In Meta for Developers',
        links: [
          { label: 'App dashboard', hint: 'Left menu → Publish switches the app between Development and Live', href: `${FB}/dashboard/` },
          { label: 'Basic settings', hint: 'App ID, App secret (Show), icon, privacy / terms / data-deletion URLs, category', href: `${FB}/settings/basic/` },
          { label: 'Login permissions', hint: 'email and public_profile must both be "Ready for testing"', href: `${FB}/use_cases/customize/?use_case_enum=FB_LOGIN&selected_tab=permissions&product_route=use_cases` },
          { label: 'Login settings', hint: 'Valid OAuth Redirect URIs', href: `${FB}/use_cases/customize/?use_case_enum=FB_LOGIN&selected_tab=settings&product_route=fb-login` },
          { label: 'All my Meta apps', hint: 'The list of every app on this Facebook account', href: 'https://developers.facebook.com/apps/' }
        ]
      }
    ],
    values: [
      { label: 'Facebook App ID (the Client ID in Supabase)', value: FACEBOOK_APP_ID },
      { label: 'Valid OAuth Redirect URI (Login settings)', value: CALLBACK_URL },
      { label: 'App domain (Basic settings)', value: 'nooob.xyz' },
      ...publicPages
    ],
    fixes: [
      ['Only I can log in / the app is "not active"', 'The app is still in Development mode. In the app dashboard open Publish in the left menu and switch it to Live. Until then only people with a role on the app can use it.'],
      ['"URL blocked" or a redirect error', 'Open Login settings → Valid OAuth Redirect URIs must contain the redirect URI below, exactly.'],
      ['No email arrives on the details page', 'Open Login permissions: email must be added and "Ready for testing". Some Facebook accounts have no email at all; NOOB then asks for one.'],
      ['Want birthday or gender filled in automatically', 'Facebook only gives those after Meta\'s App Review and business verification. Until then NOOB\'s own details page asks for them.'],
      ['The App secret leaked or must be replaced', 'Basic settings → App secret → reset it, then paste the new one into Supabase → Providers → Facebook.']
    ]
  },
  {
    id: 'discord',
    name: 'Discord',
    intro: `Discord application "NOOB" (Application ID ${DISCORD_APP_ID}). NOOB asks Discord only for identify and email.`,
    groups: [
      supabaseGroup('Discord'),
      {
        title: 'In the Discord Developer Portal',
        links: [
          { label: 'General information', hint: 'Name, icon, description, terms and privacy links', href: `${DC}/information` },
          { label: 'OAuth2', hint: 'Client ID, Reset Secret, and the Redirects list', href: `${DC}/oauth2` },
          { label: 'All my applications', hint: 'The list of every Discord app on this account', href: 'https://discord.com/developers/applications' }
        ]
      }
    ],
    values: [
      { label: 'Discord Application ID (the Client ID in Supabase)', value: DISCORD_APP_ID },
      { label: 'Redirect (OAuth2 → Redirects)', value: CALLBACK_URL },
      ...publicPages
    ],
    fixes: [
      ['Discord says "Invalid redirect_uri"', 'Open OAuth2 → Redirects must contain the redirect below, exactly, and be saved.'],
      ['"invalid_client" or login stopped working', 'The secret changed. OAuth2 → Reset Secret, copy the new one at once, paste it into Supabase → Providers → Discord. Login stays broken until you do.'],
      ['Discord says to verify your email', 'The person\'s own Discord account needs a verified email before it can sign in to any app.'],
      ['Change the name, icon or policy links people see', 'Open General information and save.']
    ]
  }
];

async function fetchProviderStatus(): Promise<Record<ProviderId, boolean | null>> {
  const unknown = { google: null, facebook: null, discord: null } as Record<ProviderId, boolean | null>;
  try {
    const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string) || ''}/auth/v1/settings`, {
      headers: { apikey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || '' }
    });
    const external = (await res.json())?.external || {};
    return { google: !!external.google, facebook: !!external.facebook, discord: !!external.discord };
  } catch {
    return unknown;
  }
}

const CopyValue: React.FC<ValueItem> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the value is still shown and can be selected by hand
    }
  };
  return (
    <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 min-w-0 text-[11px] text-zinc-200 break-all select-all">{value}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 px-2 py-1 rounded-lg border border-zinc-700 text-[11px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

export const AdminSignInPanel: React.FC = () => {
  const [tab, setTab] = useState<ProviderId>('google');
  const [status, setStatus] = useState<Record<ProviderId, boolean | null> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(await fetchProviderStatus());
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const guide = GUIDES.find((g) => g.id === tab) as Guide;
  const stateOf = (id: ProviderId) => (status ? status[id] : null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-noob" /> Sign-in providers
        </span>
        <button onClick={() => void load()} className="text-xs text-noob hover:underline flex items-center gap-1 cursor-pointer font-medium">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Check again
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug">
        Everything needed to manage the "Continue with Google / Facebook / Discord" buttons later. A provider's button shows on the login screen only while it is switched on in Supabase.
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GUIDES.map((g) => {
          const on = stateOf(g.id);
          return (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer border flex items-center gap-1.5 ${
                tab === g.id ? 'border-noob text-noob bg-noob/10' : 'border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${on === null ? 'bg-zinc-600' : on ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {g.name}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white">{guide.name}</span>
          {loading && !status ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-noob" />
          ) : (
            <span className={`text-[11px] font-bold ${stateOf(guide.id) === null ? 'text-zinc-500' : stateOf(guide.id) ? 'text-emerald-400' : 'text-red-400'}`}>
              {stateOf(guide.id) === null ? 'Status unknown' : stateOf(guide.id) ? 'Switched ON in Supabase' : 'Switched OFF in Supabase (no button on the login screen)'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-400 leading-snug">{guide.intro}</p>
      </div>

      <div className="p-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/90 leading-snug">
          Client secrets are never shown here. They live only in Supabase → Authentication → Providers, and you type them straight into that box. Never paste a secret into a chat, a message or a file.
        </p>
      </div>

      {guide.groups.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <p className="text-[11px] font-bold text-zinc-300">{group.title}</p>
          <div className="space-y-1.5">
            {group.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800 hover:border-noob/50 flex items-center gap-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{link.label}</p>
                  <p className="text-[11px] text-zinc-500 leading-snug">{link.hint}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-zinc-300">Values to copy and paste</p>
        {guide.values.map((v) => <CopyValue key={v.label} {...v} />)}
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-bold text-zinc-300">If something stops working</p>
        <div className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
          <p className="text-xs font-bold text-white">The button is missing from the login screen</p>
          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">The provider is switched off in Supabase. Open the provider settings above and switch it on. After that, refresh the login page.</p>
        </div>
        {guide.fixes.map(([problem, fix]) => (
          <div key={problem} className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
            <p className="text-xs font-bold text-white">{problem}</p>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">{fix}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
