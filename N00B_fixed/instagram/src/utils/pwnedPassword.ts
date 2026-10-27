// "Password found in a data breach": Google's password manager (and others) warn a person when the password they use for an app is in a list of passwords that leaked from some other
// site. NOOB was not leaked: the warning comes from people who re-use one password on many sites. To stop new accounts from being created with such a password (and so from showing that
// warning later), a new password is checked against the public Pwned Passwords list when somebody signs up or changes their password.
//
// Nothing secret leaves the device: only the first 5 characters of the password's SHA-1 fingerprint are sent (the "range" method: the list answers with every fingerprint that starts
// like that, and the match is made here), padded so every answer looks the same. If the check cannot be made (offline, the list is down, an old browser) the password is accepted:
// the check must never stop anybody from signing up.

export const BREACHED_PASSWORD_MESSAGE = 'This password has appeared in a known data breach (other websites leaked it), so Google and other password managers will warn you about it. Please choose a different one.';

export async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** How many times this password is in the breach list (0 = not found, or the check could not be made). */
export async function breachCount(password: string, fetchImpl: typeof fetch = (input, init) => fetch(input, init), timeoutMs = 4000): Promise<number> {
  try {
    if (!password || typeof crypto === 'undefined' || !crypto.subtle) return 0;
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5), suffix = hash.slice(5);
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' }, signal: ctl?.signal, cache: 'no-store' });
      if (!res.ok) return 0;
      const text = await res.text();
      for (const line of text.split(/\r?\n/)) {
        const [h, n] = line.trim().split(':');
        if (h === suffix) return Number(n) || 0;   // padded lines have a count of 0: they never match a real password
      }
      return 0;
    } finally { if (timer) clearTimeout(timer); }
  } catch { return 0; }
}
