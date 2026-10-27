// The Notepad's small helpers for plain text: lists that continue by themselves, check boxes, and Bold / Italic / Underline that stay plain text (special letters of the Unicode alphabet, so
// they survive being saved, copied and pasted anywhere). Pure, so each rule can be tested.

export type ListKind = 'check' | 'bullet' | 'number';
export interface Edit { text: string; start: number; end: number }

const CHECK = '☐ ', DONE = '☑ ', BULLET = '• ';
const NUMBER = /^(\d{1,3})\. /;

const lineBounds = (text: string, start: number, end: number): [number, number] => {
  const a = text.lastIndexOf('\n', Math.max(0, start) - 1) + 1;
  const e = text.indexOf('\n', Math.max(start, end));
  return [a, e === -1 ? text.length : e];
};

const stripPrefix = (line: string): string => line.replace(/^(☐ |☑ |• |\d{1,3}\. )/, '');

/** Puts (or takes off) a list mark on every line the selection touches. A check box goes ☐ → ☑ → none. */
export function toggleList(text: string, start: number, end: number, kind: ListKind): Edit {
  const [a, b] = lineBounds(text, start, end);
  const lines = text.slice(a, b).split('\n');
  const allHave = (test: (l: string) => boolean) => lines.every((l) => test(l));
  let out: string[];
  if (kind === 'check') {
    if (allHave((l) => l.startsWith(CHECK))) out = lines.map((l) => DONE + l.slice(CHECK.length));
    else if (allHave((l) => l.startsWith(DONE))) out = lines.map((l) => l.slice(DONE.length));
    else out = lines.map((l) => CHECK + stripPrefix(l));
  } else if (kind === 'bullet') {
    out = allHave((l) => l.startsWith(BULLET)) ? lines.map((l) => l.slice(BULLET.length)) : lines.map((l) => BULLET + stripPrefix(l));
  } else {
    out = allHave((l) => NUMBER.test(l)) ? lines.map((l) => l.replace(NUMBER, '')) : lines.map((l, i) => `${i + 1}. ${stripPrefix(l)}`);
  }
  const joined = out.join('\n');
  return { text: text.slice(0, a) + joined + text.slice(b), start: a, end: a + joined.length };
}

/** Enter at the end of a list line starts the next item (an empty item ends the list). Returns null when the line is not a list line. */
export function continueList(text: string, caret: number): Edit | null {
  const [a, b] = lineBounds(text, caret, caret);
  const line = text.slice(a, b);
  if (caret < b) return null;   // only at the end of the line
  let mark = '';
  if (line.startsWith(CHECK) || line.startsWith(DONE)) mark = CHECK;
  else if (line.startsWith(BULLET)) mark = BULLET;
  else { const m = NUMBER.exec(line); if (m) mark = `${Number(m[1]) + 1}. `; }
  if (!mark) return null;
  const body = stripPrefix(line);
  if (!body.trim()) {   // an empty item: the list ends here
    return { text: text.slice(0, a) + text.slice(b), start: a, end: a };
  }
  const insert = '\n' + mark;
  return { text: text.slice(0, b) + insert + text.slice(b), start: b + insert.length, end: b + insert.length };
}

// ---- Bold, Italic, Underline as plain text
const BOLD = { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec };     // mathematical sans-serif bold
const ITALIC = { upper: 0x1d608, lower: 0x1d622 };                  // mathematical sans-serif italic
const UNDERLINE = '̲';

const inRange = (cp: number, from: number, len: number) => cp >= from && cp < from + len;

export function toBold(s: string): string {
  return Array.from(s).map((ch) => {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) return String.fromCodePoint(BOLD.upper + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(BOLD.lower + c - 97);
    if (c >= 48 && c <= 57) return String.fromCodePoint(BOLD.digit + c - 48);
    return ch;
  }).join('');
}
export function toItalic(s: string): string {
  return Array.from(s).map((ch) => {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) return String.fromCodePoint(ITALIC.upper + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(ITALIC.lower + c - 97);
    return ch;
  }).join('');
}
export const toUnderline = (s: string): string => Array.from(s).map((ch) => (/\s/.test(ch) || ch === UNDERLINE ? ch : ch + UNDERLINE)).join('');

/** back to ordinary letters */
export function toPlain(s: string): string {
  return Array.from(s.split(UNDERLINE).join('')).map((ch) => {
    const c = ch.codePointAt(0)!;
    if (inRange(c, BOLD.upper, 26)) return String.fromCharCode(65 + c - BOLD.upper);
    if (inRange(c, BOLD.lower, 26)) return String.fromCharCode(97 + c - BOLD.lower);
    if (inRange(c, BOLD.digit, 10)) return String.fromCharCode(48 + c - BOLD.digit);
    if (inRange(c, ITALIC.upper, 26)) return String.fromCharCode(65 + c - ITALIC.upper);
    if (inRange(c, ITALIC.lower, 26)) return String.fromCharCode(97 + c - ITALIC.lower);
    return ch;
  }).join('');
}

/** Styles the selected text (or, with no selection, nothing). Pressing the same style again on styled text puts it back to plain. */
export function styleSelection(text: string, start: number, end: number, style: 'bold' | 'italic' | 'underline'): Edit {
  if (end <= start) return { text, start, end };
  const part = text.slice(start, end);
  const plain = toPlain(part);
  const styled = style === 'bold' ? toBold(plain) : style === 'italic' ? toItalic(plain) : toUnderline(plain);
  const next = styled === part ? plain : styled;
  return { text: text.slice(0, start) + next + text.slice(end), start, end: start + next.length };
}

/** the first line is the title, the rest is the body */
export const splitNote = (text: string): { title: string; body: string } => {
  const i = text.indexOf('\n');
  return i === -1 ? { title: text, body: '' } : { title: text.slice(0, i), body: text.slice(i + 1) };
};
export const joinNote = (title: string, body: string): string => (body ? `${title.replace(/\n/g, ' ')}\n${body}` : title.replace(/\n/g, ' '));
