// NOOB STUDY: turns the tutor's Markdown (with maths) into a small, safe structure the screen draws. It never produces HTML: every piece of text
// stays plain text, links are only ever web addresses, and maths is handed to KaTeX as text to draw. Pure and tested.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'math'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };
export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'math'; v: string }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

// only ordinary web addresses are ever links (never javascript:, data:, file:)
export function safeHref(raw: string): string | null {
  const h = String(raw || '').trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(h) || h.length > 500) return null;
  try { const u = new URL(h); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

// "$5 and $10" are prices, "$x^2$" is maths: maths opens at a $ that is not after a word and not before a space, and closes at a $ not after a space and not before a digit
function findInlineMath(s: string, from: number): { end: number; v: string } | null {
  let i = from + 1;
  if (s[i] === ' ' || s[i] === undefined || s[i] === '$') return null;
  for (; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '$') {
      if (s[i - 1] === ' ' || /\d/.test(s[i + 1] || '')) return null;
      const v = s.slice(from + 1, i);
      return v.trim() ? { end: i + 1, v } : null;
    }
    if (s[i] === '\n' && s[i + 1] === '\n') return null;
  }
  return null;
}

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  const s = src;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {                       // \( ... \)   \[ ... \]
      const close = s[i + 1] === '(' ? '\\)' : '\\]';
      const j = s.indexOf(close, i + 2);
      if (j > 0) { flush(); out.push({ t: 'math', v: s.slice(i + 2, j) }); i = j + 1; continue; }
    }
    if (c === '\\' && i + 1 < s.length && /[*_`$\\#\[\]()>~-]/.test(s[i + 1]) && s[i + 1] !== '(' && s[i + 1] !== '[') { buf += s[i + 1]; i++; continue; }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { flush(); out.push({ t: 'code', v: s.slice(i + 1, j) }); i = j; continue; }
    }
    if (c === '$' && !isWord(s[i - 1])) {
      if (s[i + 1] === '$') { const j = s.indexOf('$$', i + 2); if (j > 0) { flush(); out.push({ t: 'math', v: s.slice(i + 2, j) }); i = j + 1; continue; } }
      const m = findInlineMath(s, i);
      if (m) { flush(); out.push({ t: 'math', v: m.v }); i = m.end - 1; continue; }
    }
    if (c === '[' && depth < 3) {
      const m = /^\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        flush();
        if (href) out.push({ t: 'link', href, c: parseInline(m[1], depth + 1) });
        else out.push({ t: 'text', v: m[1] });                                          // an unsafe address: the words stay, the link goes
        i += m[0].length - 1; continue;
      }
    }
    if ((c === '*' || c === '_') && depth < 4) {
      const double = s[i + 1] === c;
      const mark = double ? c + c : c;
      let j = s.indexOf(mark, i + mark.length);
      if (double && j > i && s[j + 2] === c) j++;                                          // ***both*** : the closing mark is the last two stars
      const inner = j > i ? s.slice(i + mark.length, j) : '';
      const ok = j > i && inner.trim() && !/^\s|\s$/.test(inner) && !(c === '_' && (isWord(s[i - 1]) || isWord(s[j + mark.length])));
      if (ok) { flush(); out.push({ t: double ? 'b' : 'i', c: parseInline(inner, depth + 1) }); i = j + mark.length - 1; continue; }
    }
    if (c === '\n') { flush(); out.push({ t: 'br' }); continue; }
    buf += c;
  }
  flush();
  return out;
}

const splitRow = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
const isSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

export function parseMarkdown(src: string): Block[] {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const endPara = () => { if (para.length) { blocks.push({ t: 'p', c: parseInline(para.join('\n').trim()) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+#-]*)\s*$/.exec(line);
    if (fence) {
      endPara();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ t: 'code', lang: fence[1] || '', v: code.join('\n').slice(0, 20000) });
      continue;
    }
    if (/^\s*\$\$/.test(line) || /^\s*\\\[/.test(line)) {
      const open = /^\s*\$\$/.test(line) ? '$$' : '\\[', close = open === '$$' ? '$$' : '\\]';
      const first = line.trim().slice(open.length);
      if (first.includes(close)) { endPara(); blocks.push({ t: 'math', v: first.slice(0, first.indexOf(close)) }); continue; }
      const body: string[] = first ? [first] : [];
      let j = i + 1, closed = false;
      for (; j < lines.length; j++) {
        if (lines[j].includes(close)) { body.push(lines[j].slice(0, lines[j].indexOf(close))); closed = true; break; }
        body.push(lines[j]);
      }
      if (closed) { endPara(); blocks.push({ t: 'math', v: body.join('\n') }); i = j; continue; }
    }
    if (!line.trim()) { endPara(); continue; }
    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { endPara(); blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3 | 4, c: parseInline(h[2]) }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { endPara(); blocks.push({ t: 'hr' }); continue; }
    if (line.includes('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      endPara();
      const head = splitRow(line).map((x) => parseInline(x));
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(splitRow(lines[i]).slice(0, head.length).map((x) => parseInline(x)));
      i--;
      blocks.push({ t: 'table', head, rows: rows.slice(0, 60) });
      continue;
    }
    const li = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (li) {
      endPara();
      const ordered = /\d/.test(li[1]);
      const items: Inline[][] = [];
      const start = ordered ? parseInt(li[1], 10) : 1;
      for (; i < lines.length; i++) {
        const m = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered) { items.push(parseInline(m[2])); continue; }
        if (m) { i--; break; }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].push({ t: 'br' }, ...parseInline(lines[i].trim())); continue; }
        i--; break;
      }
      blocks.push({ t: 'list', ordered, start, items: items.slice(0, 80) });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      endPara();
      const q: string[] = [];
      for (; i < lines.length && /^\s*>\s?/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      blocks.push({ t: 'quote', c: parseInline(q.join('\n')) });
      continue;
    }
    para.push(line);
  }
  endPara();
  return blocks.slice(0, 400);
}

// plain text of a parsed answer (for copying and for tests)
export function inlineText(c: Inline[]): string {
  return c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : x.t === 'math' ? `$${x.v}$` : x.t === 'br' ? '\n' : inlineText(x.c))).join('');
}
