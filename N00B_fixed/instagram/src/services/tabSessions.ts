// Several accounts at the same time, one per tab.
//
// A browser keeps ONE saved login per website, shared by all its tabs, so logging in as a second account in another tab used to replace
// the first one and this tab had to be signed out. Now every account's login is saved on its own (one "slot" per account), and each tab
// remembers which account IT uses:
//   * saved logins   localStorage   "noob_session_v1_<account id>"  the login (session) of that account, shared by every tab using it
//   * this tab's     sessionStorage "noob_tab_account_v1"           which account this tab uses ("" = none on purpose: the login screen)
//   * new tabs       localStorage   "noob_last_account_v1"          the account a brand-new tab starts with
// Logging in as another account in one tab binds only that tab to it; the other tabs keep their own account untouched.
//
// The installed app and the browser are kept apart too. An installed app (home-screen / desktop app window) and a browser tab on the
// same device share one browser storage, which used to mean they shared ONE login: logging out in the browser logged the app out as
// well. The app now keeps its own saved logins ("noob_session_v1_app_<account id>", pointer "noob_last_account_v1_app"), so each one
// logs in and out on its own. The first time the installed app starts after this change it takes over the logins the shared storage
// held (moved, not copied: two places renewing the same login would sign both out), so nobody using only the app is logged out.
//
// This file only decides where things are kept, so it can be tested with plain stand-ins for the storages.

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SLOT_PREFIX = 'noob_session_v1_';
export const TAB_KEY = 'noob_tab_account_v1';
export const LAST_KEY = 'noob_last_account_v1';
export const APP_PREFIX = 'app_';              // the installed app's saved logins: SLOT_PREFIX + APP_PREFIX + <account id>
export const APP_LAST_KEY = 'noob_last_account_v1_app';
export const APP_CLAIM_KEY = 'noob_app_claimed_v1';
// the single saved login the app kept before accounts had their own slots ("sb-<project>-auth-token")
export const LEGACY_KEY = /^sb-[a-z0-9]+-auth-token$/i;

export interface SavedAccount {
  id: string;
  username: string;
}

const parse = (raw: string | null): any => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};
// A login worth keeping: it says whose it is and carries a token to renew it with.
const ownerOf = (session: any): string | null => (session && typeof session.user?.id === 'string' && session.user.id && typeof session.refresh_token === 'string' ? session.user.id : null);

export function createTabSessions(local: KV, tab: KV, localKeys: () => string[], opts: { app?: boolean } = {}) {
  const isApp = !!opts.app;
  const slotKey = (id: string) => SLOT_PREFIX + (isApp ? APP_PREFIX : '') + id;
  const otherSlotKey = (id: string) => SLOT_PREFIX + (isApp ? '' : APP_PREFIX) + id;
  const lastKey = isApp ? APP_LAST_KEY : LAST_KEY;
  // Which saved-login keys belong to THIS context (the browser's must not pick up the app's, whose keys start the same way).
  const ownsKey = (key: string) =>
    key.startsWith(SLOT_PREFIX + (isApp ? APP_PREFIX : '')) && (isApp || !key.startsWith(SLOT_PREFIX + APP_PREFIX));
  const hasSlot = (id: string) => !!ownerOf(parse(local.getItem(slotKey(id))));

  const bind = (id: string) => {
    tab.setItem(TAB_KEY, id);
    local.setItem(lastKey, id);
  };

  // Forgets one account's saved login: any tab bound to it is unbound (shown the login screen), and if it was the account a brand-new
  // tab would start with, that falls back to whichever other saved account is next.
  const dropSlot = (id: string) => {
    local.removeItem(slotKey(id));
    if (tab.getItem(TAB_KEY) === id) tab.setItem(TAB_KEY, '');
    if (local.getItem(lastKey) === id) {
      const next = savedAccounts().find((a) => a.id !== id);
      if (next) local.setItem(lastKey, next.id);
      else local.removeItem(lastKey);
    }
  };

  // The account this tab uses right now (null = none: show the login screen).
  const currentAccount = (): string | null => {
    const mine = tab.getItem(TAB_KEY);
    if (mine === '') return null; // this tab chose "no account" (logged out here, or adding another account)
    if (mine) return hasSlot(mine) ? mine : null; // its login is gone (logged out from another tab): signed out
    // a brand-new tab: start with the account that was used last, if it is still saved
    const last = local.getItem(lastKey);
    if (last && hasSlot(last)) {
      bind(last);
      return last;
    }
    const any = savedAccounts()[0];
    if (any) {
      bind(any.id);
      return any.id;
    }
    return null;
  };

  const savedAccounts = (): SavedAccount[] => {
    const out: SavedAccount[] = [];
    for (const key of localKeys()) {
      if (!ownsKey(key)) continue;
      const session = parse(local.getItem(key));
      const id = ownerOf(session);
      if (!id) continue;
      const meta = session.user?.user_metadata;
      out.push({ id, username: String(meta?.username || meta?.user_name || session.user?.email || 'account') });
    }
    return out.sort((a, b) => a.username.localeCompare(b.username));
  };

  return {
    // What the login library reads: this tab's account's saved login.
    read(): string | null {
      const id = currentAccount();
      return id ? local.getItem(slotKey(id)) : null;
    },

    // What the login library writes (a new login, or a renewed one): it goes into the slot of the account it belongs to. A tab with
    // no account (the login screen) takes the account that just logged in; a tab that already has one keeps it, so a renewal that
    // finishes late for another account can never move a tab to that account.
    write(value: string): void {
      const session = parse(value);
      const id = ownerOf(session);
      if (!id) return; // not a usable login: never saved
      local.setItem(slotKey(id), value);
      const mine = tab.getItem(TAB_KEY);
      if (!mine || !hasSlot(mine) || mine === id) bind(id);
    },

    // Log out of this tab's account (on this browser): its saved login is removed and this tab shows the login screen. Other tabs
    // using the same account notice they are signed out; tabs using other accounts are not affected.
    remove(): void {
      const id = tab.getItem(TAB_KEY) || currentAccount();
      if (id) dropSlot(id);
      tab.setItem(TAB_KEY, '');
    },

    // "Switch account" → remove one account from this browser's list. This forgets the saved login on THIS device only — the
    // account itself is entirely untouched (nothing is deleted on the server, and the person can just log back in later). A tab
    // that is currently using that account is signed out of it (shown the login screen), the same as a normal log-out; other
    // tabs using OTHER accounts are never affected.
    forget(id: string): void {
      dropSlot(id);
    },

    // "Add another account" / the login screen: this tab uses no account for now, WITHOUT logging anyone out.
    unbind(): void {
      tab.setItem(TAB_KEY, '');
    },

    // Use a different saved account in this tab. False when that account is not saved on this browser.
    switchTo(id: string): boolean {
      if (!hasSlot(id)) return false;
      bind(id);
      return true;
    },

    currentAccount,
    savedAccounts,

    // Is this account also logged in from the OTHER context on this device (the app, if this is the browser; the browser, if this
    // is the app)? Logging out here must then leave the device registered, because the other context still uses it.
    hasLoginInOtherContext(id: string): boolean {
      return !!ownerOf(parse(local.getItem(otherSlotKey(id))));
    },

    // Installed app only, once: takes over the logins the shared browser storage held (see the note at the top).
    claimFromBrowser(): void {
      if (!isApp || local.getItem(APP_CLAIM_KEY)) return;
      local.setItem(APP_CLAIM_KEY, '1');
      if (savedAccounts().length > 0) return; // it already has logins of its own
      for (const key of localKeys()) {
        if (!key.startsWith(SLOT_PREFIX) || key.startsWith(SLOT_PREFIX + APP_PREFIX)) continue;
        const raw = local.getItem(key);
        const id = ownerOf(parse(raw));
        if (!id || raw === null) continue;
        local.setItem(slotKey(id), raw);
        local.removeItem(key);
      }
      const last = local.getItem(LAST_KEY);
      if (last && hasSlot(last)) {
        local.setItem(lastKey, last);
        local.removeItem(LAST_KEY);
      }
    },

    // The one login the app used to keep for the whole browser becomes the first saved account (once); the old copy is removed so
    // an old version of the app in another tab can not renew a login that has moved (renewing an old token would sign the person out).
    migrateLegacy(): void {
      for (const key of localKeys()) {
        if (!LEGACY_KEY.test(key) || key.startsWith(SLOT_PREFIX)) continue;
        const session = parse(local.getItem(key));
        const id = ownerOf(session);
        if (id) {
          if (!hasSlot(id)) local.setItem(slotKey(id), JSON.stringify(session));
          if (!local.getItem(lastKey)) local.setItem(lastKey, id);
        }
        local.removeItem(key);
      }
    }
  };
}

export type TabSessions = ReturnType<typeof createTabSessions>;
