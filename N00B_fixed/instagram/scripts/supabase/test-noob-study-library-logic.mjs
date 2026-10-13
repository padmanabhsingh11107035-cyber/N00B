// Tests the parts of the NOOB STUDY library that run on the phone: cleaning text, cutting it into searchable pieces that remember their page, reading
// the text out of a PDF (including a REAL PDF, read by pdf.js itself), and the plain-sentence errors. No browser or database needed.
//
// Usage: node scripts/supabase/test-noob-study-library-logic.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (f) => import(pathToFileURL(path.resolve(f)).href);
const K = await load('src/utils/studyChunks.ts');
const P = await load('src/utils/studyPdf.ts');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

section('1. Cleaning text');
check(K.cleanText('a\u0000b\u0007c​d﻿e') === 'abcde', 'control characters (which the database cannot keep) are removed');
check(K.cleanText('x \ud83d y') === 'x y' && K.cleanText('x \ude42 y') === 'x y', 'a broken half of an emoji is dropped');
check(K.cleanText('good 🙂').includes('🙂'), 'a whole emoji is kept');
check(K.cleanText('The exam-\nple is clear and the ac-\ncount too') === 'The example is clear and the account too', 'a word split by a line break is put back together');
check(K.cleanText('well-known fact\nnext line') === 'well-known fact\nnext line', 'a real hyphen in the middle of a line is kept');
check(K.cleanText('a   b\t\tc d') === 'a b c d', 'runs of spaces become one');
check(K.cleanText('one\r\ntwo\rthree') === 'one\ntwo\nthree', 'Windows and old line endings become plain ones');
check(K.cleanText('a\n\n\n\n\nb') === 'a\n\nb', 'many blank lines become one');
check(K.cleanText('  \n  ') === '' && K.cleanText(null) === '' && K.cleanText(undefined) === '', 'nothing stays nothing');
check(K.cleanText('न्यूटन का नियम') === 'न्यूटन का नियम', 'other scripts are left exactly as they are');

section('2. Cutting text into pieces');
const para = (n, w = 'word') => Array.from({ length: n }, (_, i) => w + i).join(' ');
check(K.chunkText('').length === 0 && K.chunkText('   \n ').length === 0, 'no text gives no pieces');
const one = K.chunkText('A short note.', 4);
check(one.length === 1 && one[0].page === 4 && one[0].text === 'A short note.', 'a short note is one piece, and remembers its page');
const text = Array.from({ length: 12 }, (_, i) => 'Paragraph ' + i + '. ' + para(60)).join('\n\n');
const ch = K.chunkText(text, 2);
check(ch.length > 3 && ch.every((c) => c.text.length <= K.CHUNK_MAX && c.text.length > 0 && c.page === 2), 'a longer text becomes several pieces, none longer than the limit', ch.map((c) => c.text.length).join());
check(norm(ch.map((c) => c.text).join(' ')) === norm(K.cleanText(text)), 'nothing is lost or repeated when text is cut');
check(ch.slice(0, -1).every((c) => c.text.length >= K.CHUNK_TARGET * 0.5), 'pieces are a sensible size (not a pile of tiny ones)');
const big = K.chunkText('Sentence number one is here. '.repeat(400));
check(big.length >= 6 && big.every((c) => c.text.length <= K.CHUNK_MAX) && big.every((c) => /\.$/.test(c.text)), 'one huge paragraph is cut at sentence ends');
const noSpace = K.chunkText('x'.repeat(5000));
check(noSpace.length >= 3 && noSpace.every((c) => c.text.length <= K.CHUNK_MAX) && noSpace.map((c) => c.text).join('') === 'x'.repeat(5000), 'even text with no spaces at all is cut safely, without loss');
const hindi = K.chunkText(('यह एक वाक्य है। ').repeat(300));
check(hindi.length >= 2 && hindi.every((c) => c.text.length <= K.CHUNK_MAX), 'text with the Hindi full stop is cut at sentence ends too');
check(K.chunkText('line one\nline two\n\nnext para').map((c) => c.text).join('|') === 'line one line two\nnext para', 'single line breaks inside a paragraph become spaces, and paragraphs stay apart');
check(K.chunkPages(['first page text', '', 'third page text']).map((c) => c.page).join() === '1,3', 'pages keep their numbers (an empty page is skipped, the numbers do not shift)');
check(K.chunkPages([para(400), 'x']).filter((c) => c.page === 1).length >= 2 && K.chunkPages([para(400), 'x']).at(-1).page === 2, 'a long page makes several pieces, all on that page');
check(K.lettersIn([{ page: 1, text: 'abc' }, { page: 2, text: 'de' }]) === 5, 'letters are counted');
check(K.batches([1, 2, 3, 4, 5], 2).map((b) => b.join('')).join('|') === '12|34|5' && K.batches([]).length === 0 && K.BATCH_SIZE <= 40, 'pieces are sent in small batches (the server takes at most 40)');
const capped = K.fitToLimit([{ page: 1, text: 'a'.repeat(500000) }, { page: 2, text: 'b'.repeat(400000) }, { page: 3, text: 'c' }]);
check(capped.cut === true && capped.chunks.length === 1, 'a document longer than the limit is cut at a piece boundary, and it says so');
check(K.fitToLimit([{ page: 1, text: 'abc' }]).cut === false, 'a normal one is not cut');
check(K.chunkText(text).every((c) => c.text.length >= 1 && c.text.length <= 4000 && !/[\u0000-\u0008]/.test(c.text)), 'every piece is something the database accepts');

section('3. Putting a PDF page\'s text together');
const it = (str, y, extra = {}) => ({ str, transform: [12, 0, 0, 12, 72, y], height: 12, ...extra });
check(P.joinItems([it('Newton\'s second law', 700), it('states that force', 686), it('equals mass times acceleration.', 672)]) === 'Newton\'s second law states that force equals mass times acceleration.', 'lines of one paragraph are joined with spaces');
check(P.joinItems([it('First paragraph ends here.', 700), it('Second paragraph starts here.', 660)]) === 'First paragraph ends here.\n\nSecond paragraph starts here.', 'a clearly bigger gap starts a new paragraph');
check(P.joinItems([it('the exam-', 700), it('ple is clear', 686)]) === 'the exam-ple is clear', 'a hyphen at the end of a line is joined without a space (the cleaner then removes it)');
check(P.joinItems([it('Speed', 700), it(' = ', 700), it('distance', 700)]) === 'Speed = distance', 'pieces on one line are joined as they are');
check(P.joinItems([it('a', 700), it('', 700), it('b', 686, { hasEOL: true })]) === 'a b', 'empty pieces are skipped');
check(P.joinItems([]) === '' && P.joinItems([{ str: '' }]) === '', 'an empty page is empty text');
check(P.joinItems([{ str: 'no position' }, { str: 'at all' }]) === 'no position at all', 'pieces without a position are still kept apart by a space');

section('4. Reading a PDF (with a stand-in reader)');
const fake = (pagesText, opts = {}) => ({
  getDocument: () => ({ promise: opts.fail ? Promise.reject(Object.assign(new Error(opts.fail.message || 'x'), { name: opts.fail.name })) : Promise.resolve({
    numPages: pagesText.length, destroy: () => { fake.destroyed = (fake.destroyed || 0) + 1; },
    getPage: async (n) => ({ getTextContent: async () => ({ items: [{ str: pagesText[n - 1], transform: [1, 0, 0, 1, 0, 700], height: 12 }] }), cleanup: () => {} })
  }) })
});
let progress = [];
let r = await P.readPdf(new ArrayBuffer(10), { lib: fake(['Page one has plenty of real words in it to read.', 'Page two too, with more words than the limit.']), onProgress: (d, t) => progress.push(d + '/' + t) });
check(r.ok && r.pages.length === 2 && r.numPages === 2 && r.scanned === false && r.truncated === false && /Page one/.test(r.pages[0]), 'a PDF with text gives its pages');
check(progress.join() === '1/2,2/2', 'progress is reported page by page');
check(fake.destroyed === 1, 'the reader is always closed afterwards');
r = await P.readPdf(new ArrayBuffer(10), { lib: fake(['', '  ', '']) });
check(r.ok && r.scanned === true, 'a PDF that is only pictures of pages is recognised as a scan');
r = await P.readPdf(new ArrayBuffer(10), { lib: fake(Array.from({ length: 10 }, (_, i) => 'Page ' + i + ' with enough ordinary text to count as readable words.')), maxPages: 4 });
check(r.ok && r.pages.length === 4 && r.numPages === 10 && r.truncated === true, 'only the first pages are read when there are too many, and it says so');
r = await P.readPdf(new ArrayBuffer(10), { lib: fake([], { fail: { name: 'PasswordException', message: 'No password given' } }) });
check(!r.ok && /locked with a password/.test(r.error), 'a locked PDF gets a plain explanation');
r = await P.readPdf(new ArrayBuffer(10), { lib: fake([], { fail: { name: 'InvalidPDFException', message: 'Invalid PDF structure.' } }) });
check(!r.ok && /does not look like a PDF/.test(r.error), 'a file that is not a PDF is explained');
r = await P.readPdf(new ArrayBuffer(10), { lib: fake([], { fail: { name: 'Error', message: 'boom' } }) });
check(!r.ok && /could not be read/.test(r.error) && !/boom/.test(r.error), 'any other failure is a plain sentence, with no technical words');
r = await P.readPdf(new ArrayBuffer(0));
check(!r.ok && /empty/.test(r.error), 'an empty file is refused kindly');
r = await P.readPdf({ byteLength: 31 * 1024 * 1024 });
check(!r.ok && /very large/.test(r.error), 'a huge file is refused before anything is read');

section('5. Reading a REAL PDF with pdf.js itself');
// a small but valid two-page PDF, built here with correct byte positions
function makePdf(pageTexts) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  const fontNo = 3 + pageTexts.length * 2;
  const pageNos = [];
  pageTexts.forEach((lines) => {
    const stream = 'BT /F1 12 Tf 72 720 Td ' + lines.map((l, i) => (i ? '0 -16 Td ' : '') + '(' + l.replace(/[()\\]/g, '\\$&') + ') Tj').join(' ') + ' ET';
    const contentNo = objs.length + 2;
    pageNos.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + contentNo + ' 0 R /Resources << /Font << /F1 ' + fontNo + ' 0 R >> >> >>'));
    add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  });
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs[1] = '<< /Type /Pages /Kids [' + pageNos.map((n) => n + ' 0 R').join(' ') + '] /Count ' + pageNos.length + ' >>';
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((b, i) => { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new TextEncoder().encode(out);
}
let lib = null;
try { lib = await import('pdfjs-dist/legacy/build/pdf.mjs'); } catch (e) { console.log('  (pdf.js could not be loaded here: ' + String(e.message).slice(0, 100) + ')'); }
if (lib) {
  const bytes = makePdf([["Newton's second law states that force equals mass times acceleration.", 'A larger force gives a larger acceleration for the same mass.'], ['Newton third law: every action has an equal and opposite reaction.']]);
  const real = await P.readPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { lib });
  check(real.ok && real.numPages === 2 && real.pages.length === 2, 'a real two-page PDF is opened');
  check(real.ok && /second law states that force equals mass times acceleration/.test(real.pages[0]) && /larger acceleration for the same mass/.test(real.pages[0]), 'its first page text is read in order, as sentences', real.ok ? JSON.stringify(real.pages[0]) : real.error);
  check(real.ok && /third law: every action/.test(real.pages[1]), 'its second page text is read');
  check(real.ok && real.scanned === false, 'and it is not mistaken for a scan');
  const pieces = real.ok ? K.chunkPages(real.pages) : [];
  check(pieces.length === 2 && pieces[0].page === 1 && pieces[1].page === 2, 'the pages become pieces that remember page 1 and page 2', J(pieces));
  const empty = makePdf([[''], ['']]);
  const scan = await P.readPdf(empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength), { lib });
  check(scan.ok && scan.scanned === true, 'a real PDF with no text on its pages is recognised as a scan');
  const junk = new TextEncoder().encode('this is not a pdf at all, just words');
  const bad = await P.readPdf(junk.buffer, { lib });
  check(!bad.ok && /does not look like a PDF|could not be read/.test(bad.error), 'a file that is not a PDF is refused politely');
}
function J(o) { return JSON.stringify(o); }

section('6. The app\'s PDF reader is wired safely');
const src = fs.readFileSync('src/utils/studyPdf.ts', 'utf8');
check(/isEvalSupported: false/.test(src), 'PDFs are read with script evaluation switched off');
check(!/fetch\(|XMLHttpRequest|supabase/.test(src), 'the PDF reader never sends the file anywhere');
check(/import\('pdfjs-dist'\)/.test(src) && !/^import .* from 'pdfjs-dist'/m.test(src), 'pdf.js is fetched only when a PDF is added (not with the rest of the app)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
