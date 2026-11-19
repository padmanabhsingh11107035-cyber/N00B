import { siteOrigin } from './siteUrl';

export type InviteResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** "Invite a friend": opens the phone's share sheet with a short message and the NOOB address; where there is no share sheet (most computers) the message is copied instead. */
export async function inviteFriends(): Promise<InviteResult> {
  const url = siteOrigin();
  const text = 'Join me on NOOB Socials: reels, chat, 38 free games and more.';
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'NOOB Socials', text, url });
      return 'shared';
    }
  } catch (err) {
    // the person closed the share sheet: nothing to do (not an error)
    if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
