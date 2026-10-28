// Guest support: the help chat on the login page, for people who are not logged in. This file is the plain logic of that chat (no screen, no network): what the helper says for every
// answer the server can give, what a typed message means ("send me an OTP", "I forgot my ID"), how the browser is recognised, and what is remembered while the page is open.
// The screen is GuestSupport.tsx (this file is named ...Logic so the two names do not clash on a case-insensitive disk); the server side is the "recover-account" function and the migration 20261029000001_guest_support.sql (which holds every limit and every secret).

export const GUEST_USES = 3;   // how many times one browser may use guest support (enforced by the database; this is only for the words)

// ---------------------------------------------------------------- emails
export const isEmail = (text: string): boolean => {
  const t = String(text || '').trim();
  return t.length >= 5 && t.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t);
};
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
/** an email address somewhere inside a sentence ("my email is ana@gmail.com") */
export function findEmail(text: string): string | null {
  const m = String(text || '').match(EMAIL_IN_TEXT);
  return m && isEmail(m[0]) ? m[0].toLowerCase() : null;
}
/** a***@g***.com: enough for a person to know it is theirs, not enough to read it (the server shows the same) */
export function maskEmail(email: string): string {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '•••';
  const part = (s: string) => (s.length <= 1 ? s : s[0] + '•'.repeat(Math.min(s.length - 1, 4)));
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${part(name)}@${part(host)}${tld}`;
}

/** What may leave the screen about a typed message (to the helper's AI, to the saved chat, to the server's record of the problem): no whole email address, no long number (an emailed code, a phone number). */
export function redact(text: string): string {
  return String(text || '')
    .replace(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, (m) => maskEmail(m))
    .replace(/\b\d{6,}\b/g, '••••••');
}
/** The 6 digits of an emailed code typed as a chat message ("482913", "482 913", "my code is 482913"). Only a message that is basically just the code counts. */
export function codeFromText(text: string): string | null {
  const m = String(text || '').trim().toLowerCase().match(/^(?:(?:my |the )?(?:login |verification )?(?:code|otp|pin)(?: is|:)?\s*)?(\d[\d\s-]{4,12}\d)\.?$/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}
/** an ID typed by the person, shown back without being kept: @an••• */
export const hideId = (id: string): string => { const t = String(id || '').trim().replace(/^@/, ''); return `@${t.slice(0, 2)}•••`; };

// ---------------------------------------------------------------- what a typed message means
export type Intent = 'code' | 'forgot_id' | 'none';
/** Does the person ask for the emailed login code? (English and the usual Hindi / Hinglish words: "otp bhejo", "code mail karo") */
export function intentOf(text: string): Intent {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return 'none';
  if (/\b(forgot|forget|forgotten|lost|bhool\w*|yaad nahi)\b[^.?!]{0,30}\b(user ?id|userid|username|user name|my id|the id|id)\b/.test(t) || /\b(don'?t|do not|dont|cant|can'?t|cannot) (know|remember|recall)\b[^.?!]{0,30}\b(user ?id|userid|username|my id|id)\b/.test(t) || /\bid (yaad|pata) nahi\b/.test(t) || /\bi forgot my id\b/.test(t)) return 'forgot_id';
  if (/\botp\b/.test(t)) return 'code';
  if (/\b(login|log in|log-in|verification|verify|security|one[- ]?time|sign[- ]?in) (code|pin|password)\b/.test(t)) return 'code';
  if (/\b(send|sned|give|email|mail|bhej\w*|de ?do|kar ?do|karo)\b[^.?!]{0,40}\b(code|pin)\b/.test(t) || /\b(code|pin)\b[^.?!]{0,40}\b(send|email|mail|bhej\w*|karo|do)\b/.test(t)) return 'code';
  return 'none';
}

// ---------------------------------------------------------------- the problems to pick from
export type IssueKind = 'login' | 'password' | 'forgot_id' | 'suspended' | 'signup' | 'other';
export const ISSUES: ReadonlyArray<{ kind: IssueKind; label: string; text: string }> = [
  { kind: 'login', label: "I can't log in", text: "I can't log in to my account." },
  { kind: 'password', label: 'I forgot my password', text: 'I forgot my password.' },
  { kind: 'forgot_id', label: 'I forgot my User ID', text: 'I forgot my User ID.' },
  { kind: 'suspended', label: 'My account is locked or suspended', text: 'My account is locked or suspended.' },
  { kind: 'signup', label: "I can't create an account", text: "I can't create an account." },
  { kind: 'other', label: 'Something else', text: '' }
];

// ---------------------------------------------------------------- the helper's words for every answer of the server
export const BLOCKED_TEXT = `You have used guest help ${GUEST_USES} times on this browser. To keep NOOB safe, guest help is limited. Please use "Forgot password" on the login page, or log in and open Customer Support inside the app.`;
export const UNAVAILABLE_TEXT = 'Support is unavailable right now. Please try again in a moment.';

export function greeting(remaining: number): string {
  const left = remaining >= GUEST_USES ? `You can use guest help ${GUEST_USES} times on this browser.` : `You have **${remaining}** guest help ${remaining === 1 ? 'chat' : 'chats'} left on this browser.`;
  return `Hi! 👋 I'm **NOOB Support**. I can help you even though you are not logged in. First I need to know it is really your account.\n\nWhat is the **email address** on your NOOB account? ${left}`;
}

export function emailAnswer(status: string, o: { masked?: string; typed?: string; many?: boolean; suspended?: boolean } = {}): { text: string; ok: boolean } {
  switch (status) {
    case 'found':
      if (o.suspended) return { ok: true, text: `I found your account **${o.masked || ''}**, but it is **suspended** by the NOOB administrator, so I can not log you in. I can still answer your questions. What is the problem?` };
      return { ok: true, text: `Thank you! I found a NOOB account for **${o.masked || ''}**.${o.many ? ' More than one account uses this email, so I will also need your **User ID** in a moment.' : ''}\n\nWhat is the problem? Pick one below or write it in your own words.` };
    case 'no_account': return { ok: false, text: `I could not find any NOOB account with **${o.typed || 'that email'}**. Please check the spelling and type your email again.` };
    case 'invalid_email': return { ok: false, text: 'That does not look like an email address. Please type it like **name@gmail.com**.' };
    case 'rate_limited': return { ok: false, text: 'You have tried that a lot in a short time. Please wait a few minutes and try again.' };
    case 'limit_reached': return { ok: false, text: BLOCKED_TEXT };
    default: return { ok: false, text: UNAVAILABLE_TEXT };
  }
}

export function beginAnswer(status: string): { text: string; ok: boolean } {
  switch (status) {
    case 'ok': return { ok: true, text: '' };
    case 'limit_reached': return { ok: false, text: BLOCKED_TEXT };
    case 'rate_limited': return { ok: false, text: 'Too many help chats were started from this network today. Please try again tomorrow, or use "Forgot password" on the login page.' };
    case 'invalid_issue': return { ok: false, text: 'Please tell me a little more about the problem (at least a few words).' };
    case 'invalid_email': return { ok: false, text: 'That email does not look right. Please type it again.' };
    default: return { ok: false, text: UNAVAILABLE_TEXT };
  }
}

export function idPrompt(many: boolean): string {
  return many
    ? 'More than one account uses this email, so I need your **User ID** (your @username) to know which one you mean.'
    : 'What is your **User ID** (your @username)? If you have forgotten it, tap **I forgot my ID**.';
}

export function idAnswer(status: string, masked: string): { text: string; ok: boolean } {
  switch (status) {
    case 'match': return { ok: true, text: `That matches your account ✅. I can email a one-time code to **${masked}** and log you in right here. Shall I send it?` };
    case 'forgot': return { ok: true, text: `No problem! Your User ID is shown in the email too. I can email a one-time code to **${masked}** and log you in right here. Shall I send it?` };
    case 'mismatch': return { ok: false, text: 'That User ID does not match this email. Please try again, or tap **I forgot my ID**.' };
    case 'invalid_id': return { ok: false, text: 'Please type your User ID (your @username).' };
    case 'need_id': return { ok: false, text: 'More than one account uses this email, so I need your **User ID** to pick the right one. Please type it.' };
    case 'no_account': return { ok: false, text: 'There is no NOOB account with this email, so there is nothing to log in to. I can still answer questions, or you can create an account with **Create Account** on the login page.' };
    case 'rate_limited': return { ok: false, text: 'Too many wrong IDs in this chat. For safety I have stopped checking IDs. Tap **I forgot my ID** to continue with the emailed code instead.' };
    case 'bad_case': return { ok: false, text: 'This chat has ended. Please close it and open Help again.' };
    default: return { ok: false, text: UNAVAILABLE_TEXT };
  }
}

export function codeSentText(masked: string, sendsLeft: number): string {
  return `I have sent a **6-digit code** to **${masked}**. It works for 10 minutes. Type it in the box below and I will log you in.${sendsLeft <= 0 ? ' (That was the last code this chat can send.)' : ''}`;
}

export function codeRequestAnswer(status: string, seconds?: number): { text: string; ok: boolean } {
  switch (status) {
    case 'cooldown': return { ok: false, text: `A code was just sent. Please wait ${Math.max(1, Number(seconds) || 45)} seconds before asking for another one. Check your inbox and your spam folder.` };
    case 'rate_limited': return { ok: false, text: 'Too many codes were asked for this account in the last hour. Please try again later.' };
    case 'case_limit': return { ok: false, text: 'This chat has already sent the most codes it can (3). Please use the last code you got, or try again later.' };
    case 'id_required': return { ok: false, text: 'First I need your **User ID**, or tap **I forgot my ID**.' };
    case 'need_id': return { ok: false, text: 'More than one account uses this email, so I need your **User ID** to pick the right one. Please type it.' };
    case 'no_account': return { ok: false, text: 'There is no NOOB account for this email, so I can not send a code.' };
    case 'suspended': return { ok: false, text: 'This account has been **suspended** by the NOOB administrator, so I can not log you in.' };
    case 'not_configured': return { ok: false, text: 'Emailing a code is not switched on yet. Please use "Forgot password" on the login page.' };
    case 'send_failed': return { ok: false, text: 'I could not send the email right now. Please try again in a moment.' };
    case 'bad_case': return { ok: false, text: 'This chat has ended. Please close it and open Help again.' };
    default: return { ok: false, text: UNAVAILABLE_TEXT };
  }
}

export function codeCheckAnswer(status: string): { text: string; fatal: boolean } {
  switch (status) {
    case 'mismatch': return { fatal: false, text: 'That code is not right. Please check your email and try again.' };
    case 'bad_format': return { fatal: false, text: 'The code has 6 digits. Please type all 6.' };
    case 'missing': return { fatal: false, text: 'Please type the code from your email.' };
    case 'expired': return { fatal: true, text: 'That code has expired or was already used. Please ask me for a new one.' };
    case 'too_many_attempts': return { fatal: true, text: 'Too many wrong codes. The code was thrown away: please ask me for a new one.' };
    case 'case_locked': return { fatal: true, text: 'Too many wrong codes in this chat. For safety it is locked. Please try again later with "Forgot password" on the login page.' };
    case 'rate_limited': return { fatal: true, text: 'Too many wrong tries for this account. Please try again in an hour.' };
    case 'suspended': return { fatal: true, text: 'This account has been **suspended** by the NOOB administrator, so I can not log you in.' };
    case 'token_failed': return { fatal: true, text: 'The code was right, but I could not sign you in just now. Please ask me for a new code.' };
    case 'bad_case': return { fatal: true, text: 'This chat has ended. Please close it and open Help again.' };
    case 'id_required': return { fatal: true, text: 'First I need your **User ID**, or tap **I forgot my ID**.' };
    default: return { fatal: false, text: UNAVAILABLE_TEXT };
  }
}

/** Can the emailed code be offered right now? (an account with this email, one account or the ID given, and the ID step done) */
export function codeAllowed(s: { accountFound: boolean; many: boolean; idState: 'none' | 'matched' | 'forgot' | 'mismatch'; suspended?: boolean }): { ok: boolean; why?: 'no_account' | 'need_id' | 'id_required' | 'suspended' } {
  if (!s.accountFound) return { ok: false, why: 'no_account' };
  if (s.suspended) return { ok: false, why: 'suspended' };
  if (s.idState === 'matched') return { ok: true };
  if (s.idState === 'forgot') return s.many ? { ok: false, why: 'need_id' } : { ok: true };
  return { ok: false, why: s.many ? 'need_id' : 'id_required' };
}

// ---------------------------------------------------------------- the browser
// "The same browser" is a random id kept in the browser, in two places (the page's storage and a long cookie), so clearing only one of them does not make a new browser. The server
// keeps only a salted hash of it, and also limits the whole network, so clearing everything does not give unlimited uses either.
export const BROWSER_KEY = 'noob_guest_browser_v1';
export interface BrowserStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  cookie: { read(name: string): string | null; write(name: string, value: string): void };
  random(): string;
}
const OK_ID = /^[A-Za-z0-9_-]{16,80}$/;
export function browserIdFrom(store: BrowserStore): string {
  let local: string | null = null, cookie: string | null = null;
  try { local = store.getItem(BROWSER_KEY); } catch { /* storage blocked */ }
  try { cookie = store.cookie.read(BROWSER_KEY); } catch { /* cookies blocked */ }
  const found = [local, cookie].find((x) => x && OK_ID.test(x)) || null;
  const id = found || store.random();
  if (local !== id) { try { store.setItem(BROWSER_KEY, id); } catch { /* the cookie still keeps it */ } }
  if (cookie !== id) { try { store.cookie.write(BROWSER_KEY, id); } catch { /* the storage still keeps it */ } }
  return id;
}
export function browserId(): string {
  const store: BrowserStore = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    cookie: {
      read: (name) => { const m = document.cookie.split('; ').find((c) => c.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; },
      write: (name, value) => { document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=63072000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; }
    },
    random: () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)
  };
  return browserIdFrom(store);
}

// ---------------------------------------------------------------- what is remembered while this tab is open (never the email itself, never the code)
export interface SavedChat {
  v: 1;
  savedAt: number;
  caseId: string;
  caseKey: string;
  masked: string;
  step: 'issue' | 'id' | 'chat';
  accountFound: boolean;
  many: boolean;
  suspended: boolean;
  idState: 'none' | 'matched' | 'forgot' | 'mismatch';
  remaining: number;
  codeSentAt: number | null;
  sendsLeft: number;
  messages: Array<{ id: string; from: 'bot' | 'user'; text: string; time: string }>;
}
export const SAVED_KEY = 'noob_guest_support_v1';
export const SAVED_HOURS = 24;
export function loadSaved(raw: string | null, now = Date.now()): SavedChat | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SavedChat;
    if (!s || s.v !== 1 || typeof s.caseId !== 'string' || typeof s.caseKey !== 'string' || !s.caseId || !s.caseKey) return null;
    if (!Number.isFinite(s.savedAt) || now - s.savedAt > SAVED_HOURS * 3600 * 1000 || now < s.savedAt - 60000) return null;
    if (!Array.isArray(s.messages)) return null;
    return { ...s, messages: s.messages.filter((m) => m && typeof m.text === 'string' && (m.from === 'bot' || m.from === 'user')).slice(-60) };
  } catch { return null; }
}
