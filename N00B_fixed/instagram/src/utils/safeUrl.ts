// A link a person typed (the web link of a post or reel, the website on a profile) is only ever followed when it is a plain web address: http or https. Anything else
// (javascript:, data:, vbscript:, a broken address, one with spaces or hidden characters in it) is not a link at all. A bare "example.com" gets https:// in front.
// The page's own Content-Security-Policy and React already refuse javascript: links; this is the third lock, so a link can never become something else by accident.
const MAX_LENGTH = 2048;

export function safeExternalUrl(value?: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_LENGTH || /[\u0000-\u001f\u007f\s]/.test(raw)) return null;
  // "example.com:8080/page" looks like a scheme called "example.com", but it is a host and a port
  const hostAndPort = /^[a-z0-9.-]+:\d{1,5}(\/|$)/i.test(raw);
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) && !hostAndPort ? raw : 'https://' + raw;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || u.username || u.password) return null;   // no "https://trusted.com@evil.com" tricks
    return u.toString();
  } catch {
    return null;
  }
}
