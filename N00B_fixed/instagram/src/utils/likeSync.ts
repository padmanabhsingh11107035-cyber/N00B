// Likes that feel instant. The heart changes the moment it is tapped; this sends the change to the server in the background and
// keeps quick repeated taps in order. While one request is on its way, later taps only remember what the person wants in the
// end ("liked" or "not liked"), and when the request comes back one more request is sent only if the server ended up somewhere else.
// If the server refuses, the heart goes back and a short message says so.
export interface LikeAnswer { isLiked: boolean; likesCount: number }

const wishes = new Map<string, boolean>();   // key -> what the person wants now, for every like that is being sent

export function showNotice(text: string): void {
  try { window.dispatchEvent(new CustomEvent('noob-toast', { detail: text })); } catch { /* nothing to show it on */ }
}

export function sendLike(
  key: string,
  want: boolean,
  send: () => Promise<any>,
  onServer: (answer: LikeAnswer) => void,
  onFail: () => void
): void {
  if (wishes.has(key)) { wishes.set(key, want); return; }
  wishes.set(key, want);
  void (async () => {
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await send();
        if (!res || res.error || typeof res.isLiked !== 'boolean') throw new Error(res?.error || 'The like was not saved.');
        onServer({ isLiked: res.isLiked, likesCount: Number(res.likesCount) || 0 });
        if (wishes.get(key) === res.isLiked) return;
      }
    } catch (err: any) {
      onFail();
      const why = String(err?.message || '');
      showNotice(
        /fetch|network|failed to|timeout|load failed/i.test(why) ? 'No connection — your like was not saved.'
        : /jwt|expired|not authenticated|log in/i.test(why) ? 'Your login needs a refresh — reload the app and try again.'
        : why || 'Your like was not saved.'
      );
    } finally {
      wishes.delete(key);
    }
  })();
}
