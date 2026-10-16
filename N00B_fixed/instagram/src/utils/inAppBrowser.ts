// Links to other websites open INSIDE NOOB, under a bar that says NOOB (like Instagram's in-app browser), instead of throwing the person into
// another browser tab. This file decides which clicks count, remembers which page is open, and knows the sites that refuse to be shown inside
// another site (they get a clear "Open in browser" card instead of an empty frame).
import { useSyncExternalStore } from 'react';
import { SITE_DOMAINS } from './siteUrl.ts';
import { getDevicePrefs } from './devicePrefs.ts';

// Sites that tell browsers "do not show me inside another site" (X-Frame-Options / frame-ancestors). A page cannot see that refusal, so the
// well-known ones are listed here; anything else is tried, and every page keeps an "Open in browser" button.
const NO_FRAME_HOSTS = [
  'google.com', 'youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'messenger.com', 'x.com', 'twitter.com', 't.co',
  'linkedin.com', 'github.com', 'whatsapp.com', 'wa.me', 'telegram.org', 't.me', 'tiktok.com', 'snapchat.com', 'pinterest.com', 'reddit.com',
  'amazon.com', 'amazon.in', 'flipkart.com', 'paypal.com', 'discord.com', 'discord.gg', 'spotify.com', 'apple.com', 'microsoft.com', 'live.com',
  'zoom.us', 'twitch.tv', 'netflix.com', 'play.google.com', 'maps.google.com', 'drive.google.com', 'docs.google.com', 'linktr.ee', 'bit.ly',
  'wikipedia.org', 'medium.com', 'quora.com', 'stackoverflow.com', 'notion.so', 'canva.com', 'behance.net', 'dribbble.com', 'patreon.com'
];

export const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};

// NOOB's own website (with or without www). It forbids being shown inside any other page (X-Frame-Options, see public/_headers), so a link to it
// must never be put in the in-app browser: it would be an empty white page. It is also never "another website" for this app.
const isNoobSite = (host: string): boolean => SITE_DOMAINS.some((d) => host === d);   // every address of the website (see utils/siteUrl.ts)
const bare = (host: string): string => host.toLowerCase().replace(/^www\./, '');

// Is this a site that is known to refuse being shown inside another page?
export function isFrameBlocked(url: string): boolean {
  const host = hostOf(url);
  return !!host && (isNoobSite(host) || NO_FRAME_HOSTS.some((h) => host === h || host.endsWith('.' + h)));
}

export interface LinkClickLike {
  href?: string;
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  hasDownload?: boolean;
  noInApp?: boolean;     // the link says data-no-inapp: it must open the usual way
}

// Should a click on this link open in the in-app browser? Only ordinary clicks on web links to OTHER sites (never NOOB's own, www or not).
export function shouldOpenInApp(link: LinkClickLike, ownHost: string): boolean {
  if (!link.href || link.noInApp || link.hasDownload) return false;
  if ((link.button ?? 0) !== 0 || link.ctrlKey || link.metaKey || link.shiftKey || link.altKey) return false;   // new-tab / save shortcuts keep working
  try {
    const url = new URL(link.href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;     // mailto:, tel:, upi:, javascript: ... are never touched
    const host = bare(url.host);
    return host !== bare(ownHost) && !isNoobSite(host);     // NOOB itself (also its www address) opens the normal way
  } catch {
    return false;
  }
}

// ---- the open page, shared with the screen that draws it
let current: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openInApp = (url: string): void => { current = url; emit(); };
export const closeInApp = (): void => { current = null; emit(); };
export function useInAppPage(): string | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);
}

// Listens for clicks on links anywhere in the app (once). Returns a function that stops listening.
export function installLinkInterceptor(doc: Document = document): () => void {
  const onClick = (e: MouseEvent) => {
    if (!getDevicePrefs().openLinksInApp) return;     // Settings and activity > App and website permissions: the person wants links to open in their browser
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const open = shouldOpenInApp(
      { href: a.href, button: e.button, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, hasDownload: a.hasAttribute('download'), noInApp: a.hasAttribute('data-no-inapp') },
      doc.location.host
    );
    if (!open) return;
    e.preventDefault();
    e.stopPropagation();
    openInApp(a.href);
  };
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}
