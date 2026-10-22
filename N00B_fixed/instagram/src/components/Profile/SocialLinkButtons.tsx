import React from 'react';
import { Github, Instagram, Link2, Twitter, Youtube } from 'lucide-react';
import { SOCIAL_LABEL, SOCIAL_ORDER, socialTarget, type SocialPlatform } from '../../utils/socialLinks';

// The social profiles of a person, shown as the apps' own icons (never the link itself): one button for each, and the button opens the link they added.
const LOOK: Record<SocialPlatform, { Icon: React.ElementType; bg: string }> = {
  instagram: { Icon: Instagram, bg: 'bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-600 text-white border-white/20' },
  youtube: { Icon: Youtube, bg: 'bg-red-600 text-white border-white/20' },
  twitter: { Icon: Twitter, bg: 'bg-black text-white border-white/40' },
  github: { Icon: Github, bg: 'bg-zinc-800 text-white border-white/25' }
};

export const SocialLinkButtons: React.FC<{ links?: Partial<Record<string, string | undefined>> | null }> = ({ links }) => {
  const items = SOCIAL_ORDER.map((p) => ({ p, t: socialTarget(p, links?.[p]) })).filter((x): x is { p: SocialPlatform; t: NonNullable<ReturnType<typeof socialTarget>> } => !!x.t);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-1" data-testid="social-links">
      {items.map(({ p, t }) => {
        const { Icon, bg } = t.official ? LOOK[p] : { Icon: Link2, bg: 'bg-zinc-900 text-zinc-200 border-white/25' };
        const label = t.official ? SOCIAL_LABEL[p] : t.host;
        return (
          <a key={p} href={t.href} target="_blank" rel="noopener noreferrer nofollow" title={label} aria-label={`Open ${label}`} data-testid={`social-${p}`} data-official={t.official ? '1' : '0'}
            className={`w-11 h-11 rounded-2xl border flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-transform cursor-pointer ${bg}`}>
            <Icon className="w-5 h-5" />
          </a>
        );
      })}
    </div>
  );
};
