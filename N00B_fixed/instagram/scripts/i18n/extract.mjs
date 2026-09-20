// Finds every piece of text the app can show a person (button labels, headings, placeholders, messages...) by reading the
// source code, and writes them to src/i18n/catalog.json. That list is what gets translated. Text a person WRITES (posts,
// comments, chat messages, names) is never in it, so it is never translated or sent anywhere.
//
// Usage: node scripts/i18n/extract.mjs          (writes src/i18n/catalog.json)
//        node scripts/i18n/extract.mjs --check  (fails if the file on disk is out of date)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const { normalizeText, textId, looksLikeUiText, decodeEntities } = await import(pathToFileURL(path.resolve('src/i18n/textKey.ts')).href);

const SKIP_FILES = [/mockData\.ts$/, /^src[\\/]types\.ts$/, /\.d\.ts$/, /[\\/]i18n[\\/]/, /vite-env/];
// JSX attributes that hold text a person reads
const UI_ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'label', 'description', 'subtitle', 'tooltip', 'message', 'text', 'heading', 'caption', 'helperText', 'confirmLabel', 'cancelLabel', 'emptyText']);
// Object keys that hold text a person reads
const UI_KEYS = new Set(['label', 'title', 'name', 'text', 'description', 'desc', 'message', 'placeholder', 'subtitle', 'hint', 'caption', 'heading', 'tagline', 'cta', 'error', 'note', 'tooltip', 'header', 'summary', 'body', 'detail', 'details', 'question', 'answer', 'q', 'a', 'badge', 'tag', 'tab', 'button', 'action', 'empty', 'emptyText']);
// Functions whose text argument ends up on the screen
const MESSAGE_CALLS = /^(alert|confirm|prompt|toast|notify|showToast|showAlert|showMessage|setError|setErrorMessage|setSuccess|setSuccessMessage|setMessage|setNotice|setToast|setStatus|setStatusMessage|setInfo|setWarning|setFeedback|setNote|setHint|setLoadingText|setResult|setDeleteError|setSaveError|onError|reportError)$/;

const found = new Map(); // source text -> { files:Set }

function add(text, file) {
  const s = normalizeText(text);
  if (!s) return;
  if (!found.has(s)) found.set(s, new Set());
  found.get(s).add(file);
}

const calleeName = (call) => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
};
const propName = (n) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : '');

// Walk up through "a ? 'x' : 'y'", "a || 'x'", brackets and casts to the place the string is used.
function containerOf(node) {
  let cur = node;
  let parent = node.parent;
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent) || ts.isConditionalExpression(parent) || (ts.isBinaryExpression(parent) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.PlusToken].includes(parent.operatorToken.kind)))) {
    if (ts.isConditionalExpression(parent) && parent.condition === cur) return { kind: 'condition' };
    cur = parent;
    parent = parent.parent;
  }
  return { node: cur, parent };
}

// 'skip' | 'strict' | 'permissive'
function classify(node) {
  const { kind, parent } = containerOf(node);
  if (kind === 'condition' || !parent) return 'skip';
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isCaseClause(parent) || ts.isElementAccessExpression(parent) || ts.isComputedPropertyName(parent) || ts.isExternalModuleReference(parent)) return 'skip';
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return 'skip';
  if (ts.isJsxAttribute(parent)) return UI_ATTRS.has(parent.name.getText()) ? 'permissive' : 'skip';
  if (ts.isJsxExpression(parent)) {
    // {'text'} directly as a child is shown; as an attribute value it is handled above through the JsxAttribute
    return ts.isJsxAttribute(parent.parent) ? (UI_ATTRS.has(parent.parent.name.getText()) ? 'permissive' : 'skip') : 'permissive';
  }
  if (ts.isPropertyAssignment(parent)) return UI_KEYS.has(propName(parent.name)) ? 'permissive' : 'strict';
  if (ts.isCallExpression(parent) && parent.arguments.includes(containerOf(node).node)) return MESSAGE_CALLS.test(calleeName(parent)) ? 'permissive' : 'strict';
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && /Error$/.test(parent.expression.text)) return 'permissive';
  return 'strict';
}

function visit(node, file) {
  if (ts.isJsxText(node)) {
    const t = normalizeText(decodeEntities(node.text));
    if (/\p{L}/u.test(t) && looksLikeUiText(t, true)) add(t, file);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const how = classify(node);
    if (how !== 'skip' && looksLikeUiText(node.text, how === 'permissive')) add(node.text, file);
  } else if (ts.isTemplateExpression(node)) {
    const how = classify(node);
    if (how !== 'skip') {
      let pattern = node.head.text;
      node.templateSpans.forEach((sp, i) => { pattern += `{${i}}` + sp.literal.text; });
      const staticOnly = normalizeText(pattern.replace(/\{\d+\}/g, ' '));
      if (looksLikeUiText(staticOnly, how === 'permissive') && looksLikeUiText(pattern, true)) add(pattern, file);
    }
  }
  ts.forEachChild(node, (c) => visit(c, file));
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !SKIP_FILES.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

// The database and the server function also send messages that people read (why something was refused: "Order not found.",
// "Only the reel owner can see who viewed it.", notification wording...). They are written in the SQL migrations and in the function.
// Postgres writes a slot as % (in order); the catalog writes {0}, {1}...
function fromSql(text) {
  let i = 0;
  return text.replace(/''/g, "'").replace(/%%|%/g, (m) => (m === '%%' ? '%' : `{${i++}}`));
}
function serverTexts() {
  const out = [];
  const dir = 'supabase/migrations';
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.sql')) : []) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of sql.matchAll(/raise exception '((?:[^']|'')+)'/gi)) out.push(fromSql(m[1]));
    for (const m of sql.matchAll(/'(?:error|message)'\s*,\s*'((?:[^']|'')+)'/gi)) out.push(fromSql(m[1]));
  }
  const fn = 'supabase/functions/ai/index.ts';
  if (fs.existsSync(fn)) for (const m of fs.readFileSync(fn, 'utf8').matchAll(/\berror: '((?:[^'\\]|\\.)+)'/g)) out.push(m[1].replace(/\\'/g, "'"));
  return out;
}

const files = walk('src');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  visit(sf, f.replace(/\\/g, '/'));
}

for (const raw of serverTexts()) {
  const t = normalizeText(raw);
  if (/^\{\d+\}$/.test(t)) continue;
  if (looksLikeUiText(t, true)) add(t, 'server');
}

const strings = [...found.keys()].sort((a, b) => a.localeCompare(b, 'en')).map((s) => [textId(s), s]);
const ids = new Set(strings.map(([id]) => id));
if (ids.size !== strings.length) throw new Error('two texts got the same id: change the id function');

const out = JSON.stringify({ count: strings.length, strings }) + '\n';
const target = 'src/i18n/catalog.json';
if (process.argv.includes('--check')) {
  const now = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (now !== out) { console.error('src/i18n/catalog.json is out of date: run  node scripts/i18n/extract.mjs'); process.exit(1); }
  console.log(`catalog is up to date (${strings.length} texts)`);
} else {
  fs.writeFileSync(target, out);
  console.log(`${files.length} files read, ${strings.length} texts written to ${target} (${(out.length / 1024).toFixed(0)} KB)`);
}
