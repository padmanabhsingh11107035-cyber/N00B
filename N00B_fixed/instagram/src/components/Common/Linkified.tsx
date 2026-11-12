import React from 'react';
import { findHashtags } from '../../utils/hashtags';
import { findMentions } from '../../utils/mentions';
import { openHashtag, openMention } from '../../utils/inAppLinks';

// Turns every web address inside a piece of text (https://..., www...., or a bare name like noobsocials.com/x) into a blue link, so people can see they can tap it.
// Used for chat messages, comments, captions and bios. The colour comes from `.noob-link` in index.css (not from the grey theme remap).
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|xyz|in|net|org|io|app|co|me|gg|ly|tv|dev|ai|info|link|page|site|online|store)\b(?:\/[^\s]*)?)/gi;
const TRAILING = /[),.!?;:'"]+$/;

// A "#tag" or "@name" inside a piece of plain text (the parts between web addresses) becomes a tappable button: the hashtag page, or that person's profile. (A "#" or "@" inside a web address
// or an email address is never one: the address was cut out before this runs, and the mention rule refuses an "@" that follows a letter.)
function withTags(text: string, keyBase: string, mentions: boolean): React.ReactNode {
  const found: { start: number; end: number; kind: 'tag' | 'user'; value: string }[] = [];
  if (text.includes('#')) for (const h of findHashtags(text)) found.push({ start: h.start, end: h.end, kind: 'tag', value: h.tag });
  if (mentions && text.includes('@')) for (const u of findMentions(text)) found.push({ start: u.start, end: u.end, kind: 'user', value: u.username });
  if (found.length === 0) return text;
  found.sort((x, y) => x.start - y.start);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  found.forEach((h, n) => {
    if (h.start < last) return;
    if (h.start > last) nodes.push(text.slice(last, h.start));
    nodes.push(
      <button
        key={`${keyBase}-h${n}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); if (h.kind === 'tag') openHashtag(h.value); else openMention(h.value); }}
        className="noob-link inline p-0 m-0 bg-transparent border-0 cursor-pointer align-baseline"
        data-testid={h.kind === 'tag' ? 'noob-hashtag' : 'noob-mention'}
        {...(h.kind === 'tag' ? { 'data-tag': h.value.toLowerCase() } : { 'data-username': h.value.toLowerCase() })}
      >{text.slice(h.start, h.end)}</button>
    );
    last = h.end;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return <React.Fragment key={keyBase}>{nodes}</React.Fragment>;
}

/** `mentions: false` leaves @names as plain text (the chat draws its own member mentions). */
export function linkify(text: string | null | undefined, opts?: { mentions?: boolean }): React.ReactNode[] {
  const mentions = opts?.mentions !== false;
  if (!text) return [];
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part.includes('#') || (mentions && part.includes('@')) ? withTags(part, `t${i}`, mentions) : part;
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
