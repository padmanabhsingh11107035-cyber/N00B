// A NOOB profile QR code (Profile > share > QR, see ProfileQrModal.tsx) holds a link like https://nooob.xyz/?profile=ann.
// This reads the username out of what a scanner decoded; null when it is not a NOOB profile code.
export function parseProfileQr(decoded: string): string | null {
  const text = String(decoded ?? '').trim();
  if (!text || text.length > 600) return null;
  const valid = (name: string) => /^[A-Za-z0-9_.]{1,30}$/.test(name);
  try {
    const url = new URL(text);
    const name = url.searchParams.get('profile');
    if (name && valid(name.trim().replace(/^@/, ''))) return name.trim().replace(/^@/, '').toLowerCase();
    return null;
  } catch {
    // not a link: a bare "@ann" is accepted too
    const bare = text.replace(/^@/, '');
    return text.startsWith('@') && valid(bare) ? bare.toLowerCase() : null;
  }
}
