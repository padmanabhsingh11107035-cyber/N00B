// A phone number as the admin panel can use it: the full international form and the country it belongs to.
// (Nothing a website can ask returns the name a phone company has on record for a number, so the name shown next to it is the one the person typed in at sign-up.)

/** "🇮🇳 India (+91)" -> "IN": the flag in a country label is two letters written as symbols. */
export function isoFromLabel(label: string): string {
  const cps = Array.from(label || '').map((c) => c.codePointAt(0) || 0).filter((c) => c >= 0x1f1e6 && c <= 0x1f1ff);
  return cps.length >= 2 ? String.fromCharCode(65 + cps[0] - 0x1f1e6, 65 + cps[1] - 0x1f1e6) : '';
}

export function dialFromLabel(label: string): string {
  return /\(\+(\d+)\)/.exec(label || '')?.[1] || '';
}

export interface PhoneFacts { e164: string; display: string; iso: string; countryName: string }

export function phoneFacts(countryLabel: string | undefined | null, number: string | undefined | null): PhoneFacts | null {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  const label = countryLabel || '';
  const dial = dialFromLabel(label);
  const iso = isoFromLabel(label);
  // the number is kept without its country code (see the sign-up form), so the code is always put in front (many Indian numbers themselves start with 91)
  const e164 = `+${dial}${digits}`;
  return {
    e164,
    display: dial ? `+${dial} ${digits}` : e164,
    iso,
    countryName: label.replace(/[^\p{L}\s]/gu, '').trim()
  };
}
