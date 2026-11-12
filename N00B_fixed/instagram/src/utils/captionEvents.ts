// When the owner changes the caption of a post or reel, every list that holds a copy (Home feed, profile, hashtag pages...) hears about it here and shows the new text at once.
export interface CaptionEdited { kind: 'post' | 'reel'; id: string; caption: string; hashtags: string[] }
const EVENT = 'noob-caption-edited';
export const announceCaptionEdited = (d: CaptionEdited): void => { try { window.dispatchEvent(new CustomEvent<CaptionEdited>(EVENT, { detail: d })); } catch { /* the list refreshes by itself later */ } };
export function onCaptionEdited(fn: (d: CaptionEdited) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<CaptionEdited>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
