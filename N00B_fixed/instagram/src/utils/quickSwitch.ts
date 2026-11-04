// Double-tap on the "You" tab of the bottom bar: jump to the other account that uses the same e-mail address (or mobile number), if there is one.
//  * the other account is already signed in on this device -> switch to it at once (the app reloads into it, like the Switch account sheet does);
//  * it is not signed in here yet -> open the Switch account sheet, which lists it and asks for its password (nothing is ever signed in without the password);
//  * there is no other account -> nothing happens (the tap still opens the profile).
// With more than one other account the double-taps go round them in turn.
import { tabSessions } from '../services/supabase';
import { fetchLinkedAccounts } from '../services/supabaseApi';
import { pickNext } from './quickSwitchPick.ts';

export const OPEN_SWITCH_SHEET_EVENT = 'noob-open-switch-account';
export const QUICK_SWITCH_MESSAGE_EVENT = 'noob-quick-switch-message';
const TURN_KEY = 'noob.quickswitch.turn';
export const DOUBLE_TAP_MS = 340;

export type QuickSwitchResult = 'switched' | 'sheet' | 'none' | 'error' | 'busy';

let busy = false;
const say = (text: string) => { try { window.dispatchEvent(new CustomEvent(QUICK_SWITCH_MESSAGE_EVENT, { detail: text })); } catch { /* nothing to show it */ } };

export async function quickSwitchLinked(): Promise<QuickSwitchResult> {
  if (busy) return 'busy';
  busy = true;
  try {
    const me = tabSessions.currentAccount();
    const res = await fetchLinkedAccounts();
    if (res.state !== 'ok') { say('Could not check your other accounts right now.'); return 'error'; }
    const others = res.accounts.filter((a) => a.id !== me);
    if (!others.length) return 'none';
    const saved = tabSessions.savedAccounts();
    const here = others.filter((o) => saved.some((s) => s.id === o.id));
    if (!here.length) {
      window.dispatchEvent(new CustomEvent(OPEN_SWITCH_SHEET_EVENT));
      return 'sheet';
    }
    let last: string | null = null;
    try { last = sessionStorage.getItem(TURN_KEY); } catch { /* fine */ }
    const next = pickNext(here, last);
    if (!next) return 'none';
    try { sessionStorage.setItem(TURN_KEY, next.id); } catch { /* fine */ }
    say(`Switching to @${next.username}…`);
    window.setTimeout(() => { if (tabSessions.switchTo(next.id)) window.location.reload(); }, 120);
    return 'switched';
  } catch {
    say('Could not switch accounts. Please try again.');
    return 'error';
  } finally {
    window.setTimeout(() => { busy = false; }, 1200);
  }
}
