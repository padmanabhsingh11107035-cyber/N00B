import { uploadMediaFile, createStory, createPost } from '../../services/api';

// A picture made on the spot to share something from the Fun pages (an answer, a poll, a mood) as a Story or a Post. It is drawn in the app's black-and-white doodle look and
// goes through the app's own upload and publishing, exactly like a picture someone chose - nothing new is stored beyond an ordinary story or post.

export interface ShareCardSpec {
  /** a small label at the top, e.g. "ASK ME ANYTHING" */
  eyebrow: string;
  /** the big text: a question, a poll */
  title: string;
  /** a second block of text under it: an answer, a short status */
  body?: string;
  /** poll options, drawn as rows */
  options?: string[];
  /** a line at the bottom of the picture (not needed when there is a link: the link is the button) */
  footer?: string;
  /**
   * A REAL link: on a Story it is a tappable button on top of the picture (the Story's own "link" sticker, which opens the address); on a Post it is the post's link. The picture itself
   * only keeps room for it - the address is never just drawn as text that nobody can tap.
   */
  link?: { url: string; label: string };
  /** On a Story: put the "Send me anonymous messages" button on the card (it opens the Ask page of whoever posted it) instead of the link button. Such a Story is not saved to highlights. */
  anonymousButton?: boolean;
}

/** Where the button of a Story sits (percent of the picture, centred) and how wide it is. */
export const STORY_LINK_STICKER = { x: 50, y: 88, width: 66 } as const;

const W = 1080;
const H = 1920;
const FONT = 'Verdana, "DejaVu Sans", Geneva, "Segoe UI", Roboto, sans-serif';

/** Breaks text into lines that fit `maxWidth` (a word that is too long for a line is broken). */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (measure(trial) <= maxWidth) { line = trial; continue; }
      if (line) { lines.push(line); line = ''; }
      if (measure(word) <= maxWidth) { line = word; continue; }
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (measure(chunk + ch) > maxWidth && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}


/** A rounded rectangle path (older phones that lack roundRect get a plain rectangle). */
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

const clip = (lines: string[], max: number): string[] => (lines.length <= max ? lines : [...lines.slice(0, max - 1), `${lines[max - 1].replace(/\s+\S*$/, '')}…`]);

export function renderShareCard(spec: ShareCardSpec): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('Could not make the picture on this device.')); return; }
    const measureAt = (weight: number, size: number) => (s: string) => { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(s).width; };

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    // the stitched doodle edge
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.beginPath(); rr(ctx, 56, 56, W - 112, H - 112, 64); ctx.stroke();
    ctx.setLineDash([22, 18]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath(); rr(ctx, 92, 92, W - 184, H - 184, 44); ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText('NOOB SOCIALS', W / 2, 200);

    // the label, in a white pill
    ctx.font = `800 34px ${FONT}`;
    const label = spec.eyebrow.toUpperCase();
    const pillW = ctx.measureText(label).width + 80;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); rr(ctx, (W - pillW) / 2, 270, pillW, 76, 38); ctx.fill();
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(label, W / 2, 322);

    // the big text, as large as will fit
    const textW = W - 260;
    // everything has to end above the button / the foot of the picture, so the room is shared out by what there is to show
    const maxTitleLines = spec.body ? 5 : spec.options?.length ? (spec.options.length > 4 ? 3 : 4) : 7;
    let size = 84;
    let titleLines = wrapLines(measureAt(800, size), spec.title, textW);
    while (titleLines.length > maxTitleLines && size > 44) { size -= 6; titleLines = wrapLines(measureAt(800, size), spec.title, textW); }
    titleLines = clip(titleLines, maxTitleLines);
    const lineH = Math.round(size * 1.22);
    let y = 520;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${size}px ${FONT}`;
    for (const l of titleLines) { ctx.fillText(l, W / 2, y); y += lineH; }

    if (spec.body) {
      y += 50;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(W / 2 - 90, y - 30); ctx.lineTo(W / 2 + 90, y - 30); ctx.stroke();
      y += 40;
      const bodyLines = clip(wrapLines(measureAt(600, 56), spec.body, textW), 6);
      ctx.fillStyle = '#e5e5e5';
      ctx.font = `600 56px ${FONT}`;
      for (const l of bodyLines) { ctx.fillText(l, W / 2, y); y += 74; }
    }

    if (spec.options?.length) {
      y += 50;
      for (const opt of spec.options.slice(0, spec.options.length > 4 ? 5 : 6)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.beginPath(); rr(ctx, 150, y, W - 300, 108, 54); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 46px ${FONT}`;
        const fit = clip(wrapLines(measureAt(700, 46), opt, W - 400), 1)[0] ?? '';
        ctx.fillText(fit, W / 2, y + 70);
        y += 140;
      }
    }

    if (spec.footer && !spec.link) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 42px ${FONT}`;
      ctx.fillText(clip(wrapLines(measureAt(700, 42), spec.footer, W - 260), 2).join(' '), W / 2, H - 190);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText('noobsocials.com', W / 2, H - 135);

    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Could not make the picture.')); return; }
      resolve(new File([blob], 'noob-share.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

async function uploadCard(spec: ShareCardSpec, folder: 'stories' | 'posts'): Promise<string> {
  const file = await renderShareCard(spec);
  const uploaded = await uploadMediaFile(file, folder);
  const key = uploaded.objectKey || uploaded.url;
  if (!key) throw new Error('Could not upload the picture. Please try again.');
  return key;
}

/** The Story's own link sticker for a card's link: a button people can tap. (Nothing but our own addresses is ever put in one.) */
export function storyLinkSticker(link: { url: string; label: string }) {
  return { type: 'link' as const, data: { url: link.url, label: link.label }, x: STORY_LINK_STICKER.x, y: STORY_LINK_STICKER.y, width: STORY_LINK_STICKER.width, rotation: 0 };
}

/** The Story's "Send me anonymous messages" button (see the Story screen): it opens the Ask page of the person who posted the Story. */
export function anonMessagesSticker() {
  return { type: 'anon_messages' as const, data: { label: 'Send me anonymous messages' }, x: STORY_LINK_STICKER.x, y: STORY_LINK_STICKER.y, width: STORY_LINK_STICKER.width, rotation: 0 };
}

/** Posts the card as a Story (visible for the usual day). A card with a link gets a real tappable button on it. */
export async function shareCardAsStory(spec: ShareCardSpec): Promise<void> {
  const key = await uploadCard(spec, 'stories');
  await createStory({ mediaUrl: key, mediaType: 'image', stickers: spec.anonymousButton ? [anonMessagesSticker()] : spec.link ? [storyLinkSticker(spec.link)] : [], isCloseFriendsOnly: false });
}

/** Posts the card as a normal post on the profile. */
export async function shareCardAsPost(spec: ShareCardSpec, caption: string): Promise<void> {
  const key = await uploadCard(spec, 'posts');
  await createPost({
    caption,
    category: 'others',
    hashtags: [],
    webLink: spec.link?.url,
    slides: [{ id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now()}`, mediaUrl: key, objectKey: key, mediaType: 'image' }]
  });
}
