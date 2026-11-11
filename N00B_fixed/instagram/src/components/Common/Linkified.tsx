import React from 'react';

// Turns every web address inside a piece of text (https://..., www...., or a bare name like noobsocials.com/x) into a blue link, so people can see they can tap it.
// Used for chat messages, comments, captions and bios. The colour comes from `.noob-link` in index.css (not from the grey theme remap).
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|xyz|in|net|org|io|app|co|me|gg|ly|tv|dev|ai|info|link|page|site|online|store)\b(?:\/[^\s]*)?)/gi;
const TRAILING = /[),.!?;:'"]+$/;

export function linkify(text: string | null | undefined): React.ReactNode[] {
  if (!text) return [];
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    const m = part.match(TRAILING);
    const trailing = m ? m[0] : '';
    const url = trailing ? part.slice(0, -trailing.length) : part;
    if (!url) return part;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return (
      <React.Fragment key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="noob-link break-all" data-testid="noob-link">{url}</a>
        {trailing}
      </React.Fragment>
    );
  });
}

export const Linkified: React.FC<{ text?: string | null }> = ({ text }) => <>{linkify(text)}</>;
