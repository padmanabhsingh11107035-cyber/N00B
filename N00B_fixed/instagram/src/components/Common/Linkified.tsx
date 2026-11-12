import React from 'react';
import { findHashtags } from '../../utils/hashtags';
import { openHashtag } from '../../utils/inAppLinks';

// Turns every web address inside a piece of text (https://..., www...., or a bare name like noobsocials.com/x) into a blue link, so people can see they can tap it.
// Used for chat messages, comments, captions and bios. The colour comes from `.noob-link` in index.css (not from the grey theme remap).
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|xyz|in|net|org|io|app|co|me|gg|ly|tv|dev|ai|info|link|page|site|online|store)\b(?:\/[^\s]*)?)/gi;
const TRAILING = /[),.!?;:'"]+$/;

// A "#tag" inside a piece of plain text (the parts between web addresses) becomes a tappable button that opens the hashtag page. (A "#" inside a web address is never a tag: the address was cut out before this runs.)
function withHashtags(text: string, keyBase: string): React.ReactNode {
  const found = findHashtags(text);
  if (found.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  found.forEach((h, n) => {
    if (h.start > last) nodes.push(text.slice(last, h.start));
    nodes.push(
      <button
        key={`${keyBase}-h${n}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); openHashtag(h.tag); }}
        className="noob-link inline p-0 m-0 bg-transparent border-0 cursor-pointer align-baseline"
        data-testid="noob-hashtag"
        data-tag={h.tag.toLowerCase()}
      >{text.slice(h.start, h.end)}</button>
    );
    last = h.end;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return <React.Fragment key={keyBase}>{nodes}</React.Fragment>;
}

export function linkify(text: string | null | undefined): React.ReactNode[] {
  if (!text) return [];
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part.includes('#') ? withHashtags(part, `t${i}`) : part;
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
