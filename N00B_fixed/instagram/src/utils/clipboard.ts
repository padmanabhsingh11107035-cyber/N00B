// Copying is switched off everywhere in NOOB (see contentProtection.ts), apart from text boxes and the explicit "Copy" options the app
// offers itself: a chat message's Copy, and the copy-link / copy-invite buttons. They all come through here.

// Puts text on the clipboard; true when it worked.
export async function copyText(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const box = document.createElement('textarea');   // a text box is allowed to be selected, so this still works with copying locked
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(box);
    box.focus();
    box.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(box);
    return ok;
  } catch {
    return false;
  }
}

interface CopyableMessage {
  text?: string;
  locked?: unknown;
  sharedPostId?: string;
  sharedPostType?: 'post' | 'reel' | 'video';
  sharedProfile?: { username?: string } | null;
  sharedTrack?: { title?: string; artist?: string } | null;
}

// What the "Copy" option of a chat message puts on the clipboard: the text, or for a shared post / reel / profile / track the link or name.
// Empty when there is nothing to copy (a picture, a voice note, a message that can not be opened on this device).
export function messageCopyText(m: CopyableMessage, origin = typeof window !== 'undefined' ? window.location.origin : 'https://nooob.xyz'): string {
  if (!m || m.locked) return '';
  const text = String(m.text ?? '').trim();
  if (text) return text;
  if (m.sharedPostId && m.sharedPostType !== 'video') return `${origin}/?${m.sharedPostType === 'reel' ? 'reel' : 'post'}=${encodeURIComponent(m.sharedPostId)}`;
  if (m.sharedProfile?.username) return `@${m.sharedProfile.username}`;
  if (m.sharedTrack?.title) return [m.sharedTrack.title, m.sharedTrack.artist].filter(Boolean).join(' – ');
  return '';
}
