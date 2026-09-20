// Shared by the catalog extractor (build time) and the translator (run time): both must turn a piece of text into
// EXACTLY the same key, so this file has no dependencies and is tested on its own.

// JSX text carries line breaks and indentation; screens show it as one line. Collapse and trim.
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// A short, stable id for a text (cyrb53: 53 bits, written in base 36). Used as the database key and the cache key.
export function textId(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const HAS_LETTER = /\p{L}/u;

// A Tailwind / CSS class list ("flex items-center gap-2 text-[10px]"): every word is made of class-name characters and at
// least half of them carry a dash, colon, slash or bracket. Real sentences start with a capital letter or have plain words.
function looksLikeClassList(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  if (!words.every((w) => /^[A-Za-z0-9:\-/[\]().%_!#,'"=&>*~+]+$/.test(w))) return false;
  // class names are lower-case (capitals only appear inside [...] values like bg-[#00FF66]); "ID:" and "5-Letter Wordle" are text
  if (words.some((w) => /[A-Z]/.test(w.replace(/\[[^\]]*\]/g, '')))) return false;
  const marked = words.filter((w) => /[-:[\]/]/.test(w)).length;
  return marked >= Math.max(1, Math.ceil(words.length / 2));
}

function looksLikeCodeOrLink(s: string): boolean {
  if (/^(https?:|mailto:|tel:|data:|blob:|\/|\.\/|\.\.\/|#|@[\w.]+$)/i.test(s)) return true;
  if (/^[a-z-]+\(.*\)$/i.test(s) && /\d|#|var\(/.test(s)) return true; // a CSS value: conic-gradient(...), rgba(...)
  if (/^[\w.-]+\.(png|jpe?g|gif|webp|svg|mp3|mp4|webm|json|css|js|ts|tsx)$/i.test(s)) return true;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(s)) return true; // camelCase identifier
  if (/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(s)) return true; // snake_case or kebab-case identifier
  if (/^[A-Z0-9_]{2,}$/.test(s) && !s.includes(' ')) return true; // CONSTANT_NAME
  if (/^[\w-]+(\.[\w-]+)+$/.test(s)) return true; // dotted.path
  if (/^\d/.test(s) && !/\p{L}{3}/u.test(s)) return true; // a number / a time / a size with a short unit
  if (/[{}<>]|=>|\bfunction\b|\breturn\b/.test(s) && !/\{\d+\}/.test(s)) return true; // code
  return false;
}

// Would this text be something a person reads on a screen? `permissive` is for places where a string is known to be shown
// (a button label, a placeholder, an alert): there even a single lower-case word counts.
export function looksLikeUiText(raw: string, permissive = false): boolean {
  const s = normalizeText(raw);
  if (s.length < 2 || s.length > 400) return false;
  if (!HAS_LETTER.test(s)) return false;
  if (looksLikeClassList(s) || looksLikeCodeOrLink(s)) return false;
  if (permissive) return true;
  const spaced = /\s/.test(s);
  const capital = /^\p{Lu}/u.test(s);
  const punctuated = /[.!?:…]$/.test(s);
  return (spaced && /\p{L}{2}/u.test(s)) || capital || punctuated;
}

// JSX text is written with HTML entities (&amp; &nbsp; &#39;...): the screen shows the decoded text.
export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', times: '×', larr: '←', rarr: '→' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return named[e.toLowerCase()] ?? m;
  });
}
