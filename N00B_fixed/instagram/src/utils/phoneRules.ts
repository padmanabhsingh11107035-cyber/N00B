// How many digits a mobile number has in each country the sign-up form offers (the digits typed AFTER the country code, without a leading 0).
// Most countries use one exact length. A few (Germany, New Zealand, Italy, South Korea, Indonesia) really do have mobile numbers of more than
// one length, so those take a small range instead of refusing real numbers. Keyed by the dial code in the country's label, e.g. "🇮🇳 India (+91)".
const RULES: Record<string, { min: number; max: number }> = {
  '1': { min: 10, max: 10 },    // United States, Canada
  '7': { min: 10, max: 10 },    // Russia
  '27': { min: 9, max: 9 },     // South Africa
  '33': { min: 9, max: 9 },     // France
  '34': { min: 9, max: 9 },     // Spain
  '39': { min: 9, max: 10 },    // Italy
  '44': { min: 10, max: 10 },   // United Kingdom
  '49': { min: 10, max: 11 },   // Germany
  '52': { min: 10, max: 10 },   // Mexico
  '55': { min: 11, max: 11 },   // Brazil
  '61': { min: 9, max: 9 },     // Australia
  '62': { min: 9, max: 12 },    // Indonesia
  '64': { min: 8, max: 10 },    // New Zealand
  '65': { min: 8, max: 8 },     // Singapore
  '81': { min: 10, max: 10 },   // Japan
  '82': { min: 9, max: 10 },    // South Korea
  '91': { min: 10, max: 10 },   // India
  '234': { min: 10, max: 10 },  // Nigeria
  '966': { min: 9, max: 9 },    // Saudi Arabia
  '971': { min: 9, max: 9 },    // United Arab Emirates
};
const FALLBACK = { min: 7, max: 15 }; // a country that is not in the list above

export interface PhoneRule { dial: string; min: number; max: number; }

/** The rule for a country label such as "🇮🇳 India (+91)". */
export function phoneRuleFor(countryLabel: string): PhoneRule {
  const dial = /\(\+(\d+)\)/.exec(countryLabel || '')?.[1] || '';
  return { dial, ...(RULES[dial] || FALLBACK) };
}

/** "10 digits" or "10 or 11 digits" / "9 to 12 digits". */
export function phoneLengthText(rule: PhoneRule): string {
  if (rule.min === rule.max) return `${rule.max} digits`;
  return rule.max - rule.min === 1 ? `${rule.min} or ${rule.max} digits` : `${rule.min} to ${rule.max} digits`;
}

/**
 * What the box should hold after the person types or pastes: digits only, never longer than the country allows. A number pasted with its country
 * code (+91 98240 04927) or with the leading 0 people write at home (098240 04927) is trimmed to the number itself, but only when it is too long
 * otherwise, so a real number that happens to start with those digits is left alone.
 */
export function cleanPhoneInput(value: string, rule: PhoneRule): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length > rule.max) {
    if (rule.dial && digits.startsWith(rule.dial) && digits.length - rule.dial.length >= rule.min && digits.length - rule.dial.length <= rule.max) digits = digits.slice(rule.dial.length);
    else if (digits.startsWith('0') && digits.length - 1 >= rule.min && digits.length - 1 <= rule.max) digits = digits.slice(1);
  }
  return digits.slice(0, rule.max);
}

/** null when the number has the right number of digits for the country, otherwise the sentence to show. */
export function phoneProblem(value: string, countryLabel: string): string | null {
  const rule = phoneRuleFor(countryLabel);
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= rule.min && digits.length <= rule.max) return null;
  const country = (countryLabel || '').replace(/^\S+\s+/, '').replace(/\s*\(\+\d+\)\s*$/, '') || 'this country';
  return `A mobile number in ${country} has ${rule.min === rule.max ? 'exactly ' : ''}${phoneLengthText(rule)} (without +${rule.dial || 'the country code'} or a leading 0). You entered ${digits.length}.`;
}
