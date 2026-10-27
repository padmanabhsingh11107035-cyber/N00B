// "Where did you hear about NOOB?": asked once, right after an account is made (by the emailed-code sign-up or by Continue with Google). The sign-up writes a small mark on this
// device saying whose account was just made; the card (components/Common/SignupSourceCard.tsx) shows only for that account, and the mark goes away with the answer (or with Skip),
// so nobody is asked twice and nobody who signed up before this existed is asked at all.

export const ASK_KEY = 'noob_ask_source';

export const SOURCE_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: 'friend', label: 'A friend or family', emoji: '🧑‍🤝‍🧑' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'youtube', label: 'YouTube', emoji: '▶️' },
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { id: 'snapchat', label: 'Snapchat', emoji: '👻' },
  { id: 'facebook', label: 'Facebook', emoji: '👍' },
  { id: 'x', label: 'X / Twitter', emoji: '🐦' },
  { id: 'telegram', label: 'Telegram', emoji: '✈️' },
  { id: 'google', label: 'Google search', emoji: '🔎' },
  { id: 'school', label: 'School or college', emoji: '🎓' },
  { id: 'store', label: 'Play Store / App Store', emoji: '📱' },
  { id: 'news', label: 'News or a blog', emoji: '📰' },
  { id: 'event', label: 'An event or poster', emoji: '🎪' },
  { id: 'other', label: 'Somewhere else', emoji: '✨' }
];

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function markAskSource(userId: string | undefined | null, store: Store | null = local()): void {
  if (!userId || !store) return;
  try { store.setItem(ASK_KEY, userId); } catch { /* storage is off: the card is simply not shown */ }
}
export function shouldAskSource(userId: string | undefined | null, store: Store | null = local()): boolean {
  if (!userId || !store) return false;
  try { return store.getItem(ASK_KEY) === userId; } catch { return false; }
}
export function clearAskSource(store: Store | null = local()): void {
  try { store?.removeItem(ASK_KEY); } catch { /* ignore */ }
}
export const cleanSource = (id: string): string => (SOURCE_OPTIONS.some((o) => o.id === id) ? id : 'other');
