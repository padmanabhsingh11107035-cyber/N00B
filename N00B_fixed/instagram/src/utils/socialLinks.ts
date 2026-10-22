import { safeExternalUrl } from './safeUrl.ts';

// The social profiles on a NOOB profile (Instagram, YouTube, X / Twitter, GitHub). A person may type a handle ("@nooob") or paste the whole link; the profile shows the app's own icon as
// a button and the button opens the link. A link is only followed when it is a plain web address (safeExternalUrl), and an icon only says "Instagram" when the link really is on Instagram's
// own address; any other address gets a plain link icon instead, so an icon can never send somebody somewhere it does not say.
export type SocialPlatform = 'instagram' | 'youtube' | 'twitter' | 'github';
export const SOCIAL_ORDER: ReadonlyArray<SocialPlatform> = ['instagram', 'youtube', 'twitter', 'github'];
export const SOCIAL_LABEL: Record<SocialPlatform, string> = { instagram: 'Instagram', youtube: 'YouTube', twitter: 'X / Twitter', github: 'GitHub' };

const HOSTS: Record<SocialPlatform, string[]> = {
  instagram: ['instagram.com', 'instagr.am'],
  youtube: ['youtube.com', 'youtu.be'],
  twitter: ['twitter.com', 'x.com'],
  github: ['github.com']
};
const BASE: Record<SocialPlatform, string> = { instagram: 'https://instagram.com/', youtube: 'https://youtube.com/', twitter: 'https://x.com/', github: 'https://github.com/' };

const hostOf = (href: string): string => { try { return new URL(href).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const onPlatform = (p: SocialPlatform, host: string): boolean => HOSTS[p].some((d) => host === d || host.endsWith(`.${d}`));

export interface SocialTarget { href: string; /** true when the address is really on the platform's own site */ official: boolean; host: string }

/** What a social field opens: the full link, or one built from a handle; null when there is nothing safe to open. */
export function socialTarget(platform: SocialPlatform, raw?: string | null): SocialTarget | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const isAddress = /^(https?:\/\/|www\.)/i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(v);   // "instagram.com/nooob" is a link; "nooob.xyz" alone is a handle (handles have dots)
  let href: string | null;
  if (isAddress) {
    href = safeExternalUrl(v);
  } else {
    const handle = v.replace(/^@/, '');
    if (platform === 'youtube') {
      if (!/^[A-Za-z0-9._\-/]{1,100}$/.test(handle)) return null;
      href = safeExternalUrl(`${BASE.youtube}${v.startsWith('@') || handle.includes('/') ? v : `@${handle}`}`);
    } else {
      if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return null;
      href = safeExternalUrl(`${BASE[platform]}${handle}`);
    }
  }
  if (!href) return null;
  const host = hostOf(href);
  return { href, host, official: onPlatform(platform, host) };
}
