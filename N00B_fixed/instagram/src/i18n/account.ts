// A person's language belongs to their account (so it follows them to another phone or browser) and is also remembered on the
// device (so the login page can already be in it). It is kept in the login's own profile data ("user_metadata"), which the person
// can already change and nobody else can read: no database change is needed for it.
import { supabase } from '../services/supabase';
import { DEFAULT_LANGUAGE, findLanguage } from './languages.ts';
import { getLanguage, setBackgroundFill, setLanguage } from './engine.ts';

async function saveToAccount(code: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.auth.updateUser({ data: { language: code } });
  } catch {
    // offline or signed out: the device keeps the choice, and it is saved to the account the next time they log in
  }
}

// The person picked a language (login page, sign-up form or settings): show it now and, if they are logged in, keep it on the account.
export async function chooseLanguage(code: string): Promise<void> {
  await setLanguage(code);
  await saveToAccount(getLanguage());
}

// Just after logging in (or opening the app while logged in): the account's language wins; an account that never chose one takes
// the language this device is showing.
export async function applyAccountLanguage(): Promise<void> {
  let stored: string | undefined;
  try {
    const fresh = await supabase.auth.getUser(); // asks the server, so a change made on another device is seen
    stored = fresh.data.user?.user_metadata?.language;
    if (!fresh.data.user) {
      const { data } = await supabase.auth.getSession();
      stored = data.session?.user?.user_metadata?.language;
    }
  } catch {
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }) as any);
    stored = data?.session?.user?.user_metadata?.language;
  }
  const code = findLanguage(stored)?.code;
  if (code) {
    if (code !== getLanguage()) await setLanguage(code);
  } else if (getLanguage() !== DEFAULT_LANGUAGE) {
    await saveToAccount(getLanguage());
  }
}

// While someone is logged in, the translator keeps preparing the rest of the app in the background; when they log out it stops.
export function setSignedIn(signedIn: boolean): void {
  setBackgroundFill(signedIn);
}
