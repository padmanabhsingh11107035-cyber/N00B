// Photos and videos that people send in a chat: load by themselves, only on Wi-Fi, or only when tapped (Settings > Chats). A phone that does not tell the page what kind of
// connection it is on (an iPhone) counts as Wi-Fi, so "Only on Wi-Fi" never leaves a picture stuck there; "Data saver" on counts as mobile data.
export type AutoLoadMode = 'always' | 'wifi' | 'never';

export function onMobileData(): boolean {
  try {
    const c = (navigator as unknown as { connection?: { type?: string; saveData?: boolean; effectiveType?: string } }).connection;
    if (!c) return false;
    return c.type === 'cellular' || c.saveData === true;
  } catch {
    return false;
  }
}

/** May a received picture / video load without a tap? */
export function mediaMayLoad(mode: AutoLoadMode, mobile: boolean = onMobileData()): boolean {
  if (mode === 'never') return false;
  if (mode === 'wifi') return !mobile;
  return true;
}
