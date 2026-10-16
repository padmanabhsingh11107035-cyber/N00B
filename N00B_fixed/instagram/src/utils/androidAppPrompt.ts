// For people who use NOOB on the WEBSITE on an Android phone: when to offer them the Android app (components/Common/AndroidAppPrompt.tsx). It comes up by itself a little after
// sign-in, once, and again after two weeks (at most three times) if it was dismissed with "Not now"; once the file was opened it never comes back. Never shown inside the
// Android app itself, in an installed home-screen app, on an iPhone or on a computer.

export const PROMPT_REPEAT_MS = 14 * 24 * 3600 * 1000;
export const PROMPT_MAX_TIMES = 3;
export interface PromptMemory { at: number; times: number; done?: boolean }

export function shouldOfferAndroidApp(c: { userAgent: string; native: boolean; installed: boolean; memory: PromptMemory | null; now: number }): boolean {
  if (c.native || c.installed || !/android/i.test(c.userAgent)) return false;
  if (!c.memory) return true;
  if (c.memory.done) return false;
  return c.memory.times < PROMPT_MAX_TIMES && c.now - c.memory.at >= PROMPT_REPEAT_MS;
}
