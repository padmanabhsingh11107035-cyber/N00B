// NOOB STUDY: reading the text out of a PDF on the student's own phone (the file never leaves it; only the text is saved). pdf.js is fetched the first
// time a PDF is added. Failures come back as plain sentences, and a PDF that is only pictures of pages (a scan) is recognised and explained.

export interface PdfTextItem { str: string; hasEOL?: boolean; transform?: number[]; height?: number }
export interface PdfLib {
  getDocument: (src: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }) => { promise: Promise<PdfDoc>; destroy?: () => unknown };
  GlobalWorkerOptions?: { workerSrc: string };
}
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }>; cleanup?: () => void }>; destroy?: () => unknown }

// (both shapes list every field, so the code reads the same under the project's lenient TypeScript settings)
export type PdfResult =
  | { ok: true; pages: string[]; numPages: number; scanned: boolean; truncated: boolean; error?: undefined }
  | { ok: false; error: string; pages?: undefined; numPages?: undefined; scanned?: undefined; truncated?: undefined };

export const MAX_PDF_PAGES = 400;
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

// One page's text pieces -> readable paragraphs: a line break inside a sentence becomes a space, and a clearly larger gap between lines starts a new paragraph.
export function joinItems(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastH = 0;
  for (const it of items) {
    const s = typeof it.str === 'string' ? it.str : '';
    const y = it.transform && it.transform.length >= 6 ? it.transform[5] : null;
    const h = it.height || (it.transform ? Math.abs(it.transform[3]) : 0) || lastH || 10;
    if (s === '' && !it.hasEOL) continue;
    if (y === null && out && s && !/\s$/.test(out) && !/^\s/.test(s)) out += ' ';          // no position known: at least keep the words apart
    if (y !== null && lastY !== null && Math.abs(y - lastY) > 0.5 * h) {
      const gap = Math.abs(y - lastY);
      out += gap > 1.9 * Math.max(h, lastH) ? '\n\n' : out.endsWith('-') ? '' : ' ';
    }
    out += s;
    if (it.hasEOL && !/\n\s*$/.test(out)) out += ' ';
    if (y !== null) lastY = y;
    lastH = h;
  }
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

async function defaultLib(): Promise<PdfLib> {
  const lib = (await import('pdfjs-dist')) as unknown as PdfLib;
  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  } catch { /* pdf.js then reads on the main thread, which is slower but works */ }
  return lib;
}

function describe(err: unknown): string {
  const name = String((err as { name?: string })?.name || '');
  const msg = String((err as { message?: string })?.message || '');
  if (/Password/i.test(name) || /password/i.test(msg)) return 'This PDF is locked with a password. Please open it, save a copy without the password, and add that.';
  if (/InvalidPDF|Invalid PDF|FormatError|Missing PDF/i.test(name + ' ' + msg)) return 'This file does not look like a PDF, or it is damaged. Please try another copy.';
  return 'This PDF could not be read. Please try another copy, or paste the text instead.';
}

export async function readPdf(data: ArrayBuffer, opts: { lib?: PdfLib; maxPages?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<PdfResult> {
  if (!data || data.byteLength === 0) return { ok: false, error: 'This file is empty.' };
  if (data.byteLength > MAX_PDF_BYTES) return { ok: false, error: 'This PDF is very large (over 30 MB). Please add it in parts, or paste the text you need.' };
  let doc: PdfDoc | null = null;
  try {
    const lib = opts.lib || (await defaultLib());
    const task = lib.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false });
    doc = await task.promise;
    const limit = Math.min(doc.numPages, opts.maxPages ?? MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let n = 1; n <= limit; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(joinItems(content.items));
      page.cleanup?.();
      opts.onProgress?.(n, limit);
    }
    const letters = pages.reduce((a, p) => a + p.replace(/\s/g, '').length, 0);
    // fewer than about 25 letters a page: the pages are pictures, not text
    const scanned = limit > 0 && letters < 25 * limit;
    return { ok: true, pages, numPages: doc.numPages, scanned, truncated: doc.numPages > limit };
  } catch (err) {
    return { ok: false, error: describe(err) };
  } finally {
    try { await doc?.destroy?.(); } catch { /* nothing to do */ }
  }
}
