// Finds text that cannot shrink and so runs off the screen (the "Followed by @a and @long_name" line on a profile was cut at the screen edge).
// A `truncate` / `line-clamp` text only truncates when every box between it and a box with a fixed width can shrink:
//   - a flex item (a child of a `flex` row) needs `min-w-0` (or overflow-hidden, a width, max-w, shrink-0);
//   - a button / link / span that is a flex box sizes itself to its text, so it needs `max-w-full` (or w-full, min-w-0, flex-1 ...).
// A `<span>` with `truncate` that is not a block or a flex item does not truncate at all.
// Usage: node scripts/lint-text-fit.mjs [--check]   (--check exits 1 when something is found)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
};
walk(path.join(root, 'src'));

const tokensOf = (attrs) => {
  const out = new Set();
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      for (const t of n.text.split(/\s+/)) if (t) out.add(t);
    }
    ts.forEachChild(n, visit);
  };
  if (attrs) visit(attrs);
  return out;
};

const elementOf = (n) => (ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null);
const infoOf = (n) => {
  const open = elementOf(n);
  if (!open) return null;
  const tag = open.tagName.getText();
  let cls = new Set();
  for (const a of open.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'className' && a.initializer) cls = tokensOf(a.initializer);
    if (ts.isJsxAttribute(a) && a.name.getText() === 'style' && /maxWidth|width/.test(a.initializer?.getText() || '')) cls.add('max-w-style');
  }
  return { tag, cls };
};
const parentElement = (n) => {
  let p = n.parent;
  while (p && !ts.isJsxElement(p)) p = p.parent;
  return p || null;
};

const has = (cls, re) => [...cls].some((t) => re.test(t.replace(/^[a-z0-9\[\]:-]*?:(?=[a-z!\[-])/, '')));
const anyVariant = (cls, re) => [...cls].some((t) => re.test(t));
const isFlexRow = (cls) => anyVariant(cls, /^(flex|inline-flex)$/) && !anyVariant(cls, /^flex-col$/);
const isFlex = (cls) => anyVariant(cls, /^(flex|inline-flex)$/);
const bounded = (cls) => anyVariant(cls, /^(min-w-0|overflow-hidden|truncate|w-full|max-w-|w-\d|w-\[|size-|shrink-0|flex-shrink-0|flex-none|basis-)/);
const fillsWidth = (cls) => anyVariant(cls, /^(w-full|min-w-0|max-w-|flex-1|overflow-hidden|truncate|grow|w-\d|w-\[|size-)/);

const found = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node, msg) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${path.relative(root, file).replace(/\\/g, '/')}:${line + 1}  ${msg}`);
  };
  const visit = (n) => {
    const me = infoOf(n);
    if (me && (anyVariant(me.cls, /^(truncate|text-ellipsis)$/) || anyVariant(me.cls, /^line-clamp-\d/))) {
      const parent = parentElement(n);
      const pi = parent ? infoOf(parent) : null;
      // a text with its own max width, an absolutely placed text, or a text inside a grid cell is already bounded
      if (anyVariant(me.cls, /^(max-w-|absolute$)/)) { ts.forEachChild(n, visit); return; }
      const inFlexRow = !!(pi && isFlexRow(pi.cls));
      if (me.tag === 'span' && !anyVariant(me.cls, /^(block|inline-block|flex|inline-flex|grid)$/) && !anyVariant(me.cls, /^line-clamp-/) && !inFlexRow && !(pi && (isFlex(pi.cls) || anyVariant(pi.cls, /^grid$/) || !/^[a-z]/.test(pi.tag)))) {
        report(n, '<span> with truncate is inline, so it never truncates (add `block`)');
      }
      // climb: every ancestor up to the first one that has a definite width must be able to shrink
      let child = n; let cur = parent;
      for (let depth = 0; cur && depth < 8; depth++) {
        const ci = infoOf(cur); if (!ci) break;
        const cp = parentElement(cur); const cpi = cp ? infoOf(cp) : null;
        if (cpi && anyVariant(cpi.cls, /^grid$/)) break; // a grid cell is as wide as its column
        if (anyVariant(ci.cls, /^(absolute|fixed)$/)) break;
        const isItem = !!(cpi && isFlexRow(cpi.cls));
        const sizesToContent = ci.tag === 'button' || anyVariant(ci.cls, /^(inline-flex|inline-block|w-fit|w-auto)$/) || (ci.tag === 'span' && isFlex(ci.cls));
        if (isItem) {
          if (!bounded(ci.cls)) { report(cur, `flex item <${ci.tag}> holds a truncating text (line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}) but has no min-w-0`); break; }
          break;
        }
        if (sizesToContent && isFlex(ci.cls)) {
          if (!fillsWidth(ci.cls)) { report(cur, `<${ci.tag}> is a flex box that sizes to its text and holds a truncating text (line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}) but has no max-w-full`); break; }
          break;
        }
        if (['div', 'section', 'li', 'p', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'ul'].includes(ci.tag) && !isFlex(ci.cls)) break; // block: as wide as its parent
        child = cur; cur = cp;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

found.forEach((f) => console.log(f));
console.log(`\n${found.length} place(s) where a text cannot shrink`);
if (process.argv.includes('--check') && found.length) process.exit(1);
