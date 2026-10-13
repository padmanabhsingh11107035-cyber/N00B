import { newRef, studyApi, type Result } from './studyApi';
import { extractText, preparePicture } from './studyAi';
import { readPdf } from '../utils/studyPdf';
import { BATCH_SIZE, batches, chunkPages, chunkText, fitToLimit, type TextChunk } from '../utils/studyChunks';
import type { MaterialKind, StudyMaterial } from '../utils/studyTypes';

// NOOB STUDY's library, the phone's side: a PDF, text file, photos of pages, or pasted text is turned into text pieces ON THE PHONE and only the text is
// saved (never the file). Every failure is a plain sentence. A document that fails half-way is removed again, so no half-made document is ever left.

export interface Prepared { kind: MaterialKind; sourceName: string; pages: number | null; chunks: TextChunk[]; note: string; suggestedTitle: string }
export type Progress = (text: string, fraction?: number) => void;

const TEXT_FILE = /\.(txt|md|markdown|csv|tsv|tex)$/i;
const OFFICE_FILE = /\.(docx?|pptx?|xlsx?|odt|odp|pages|key|numbers)$/i;
const titleFrom = (name: string): string => name.replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

export async function prepareFile(file: File, onProgress: Progress): Promise<Result<Prepared>> {
  const name = file.name || 'document';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);
  if (isPdf) {
    onProgress('Opening the PDF…');
    let buf: ArrayBuffer;
    try { buf = await file.arrayBuffer(); } catch { return { ok: false, error: 'This file could not be opened. Please choose it again.' }; }
    const r = await readPdf(buf, { onProgress: (d, t) => onProgress('Reading page ' + d + ' of ' + t + '…', d / t) });
    if (!r.ok) return { ok: false, error: r.error };
    if (r.scanned) return { ok: false, error: 'This PDF is made of pictures of pages, so there is no text to read. Take photos of the pages (Add, then Photos of pages) or paste the text instead.' };
    const chunks = chunkPages(r.pages);
    if (!chunks.length) return { ok: false, error: 'No readable text was found in this PDF.' };
    return { ok: true, data: { kind: 'pdf', sourceName: name.slice(0, 200), pages: r.numPages, chunks, note: r.truncated ? 'Only the first pages were read (a very long PDF).' : '', suggestedTitle: titleFrom(name) } };
  }
  if (OFFICE_FILE.test(name)) return { ok: false, error: 'Word, PowerPoint and similar files cannot be read here yet. Please save it as a PDF (File, then Save as PDF) and add that, or paste the text.' };
  if (file.type.startsWith('text/') || TEXT_FILE.test(name)) {
    if (file.size > 3 * 1024 * 1024) return { ok: false, error: 'This text file is very large. Please add it in parts.' };
    onProgress('Reading the file…');
    let text = '';
    try { text = await file.text(); } catch { return { ok: false, error: 'This file could not be opened. Please choose it again.' }; }
    const chunks = chunkText(text);
    if (!chunks.length) return { ok: false, error: 'This file has no text in it.' };
    return { ok: true, data: { kind: 'text', sourceName: name.slice(0, 200), pages: null, chunks, note: '', suggestedTitle: titleFrom(name) } };
  }
  return { ok: false, error: 'This kind of file is not supported. Please add a PDF or a text file, take photos of the pages, or paste the text.' };
}

// Photos of pages: each is made small, read by the AI (one "photo question" of the day's allowance each) and forgotten: it is never uploaded to a store
export async function prepareImages(files: File[], onProgress: Progress): Promise<Result<Prepared>> {
  if (!files.length) return { ok: false, error: 'Please choose at least one picture.' };
  if (files.length > 12) return { ok: false, error: 'Please choose up to 12 pictures at a time.' };
  const pages: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress('Reading picture ' + (i + 1) + ' of ' + files.length + '…', i / files.length);
    const pic = await preparePicture(files[i]);
    if (!pic.ok) return { ok: false, error: pic.error };
    const r = await extractText([pic.data.data]);
    if (!r.ok) return { ok: false, error: i > 0 ? 'Picture ' + (i + 1) + ' could not be read. ' + r.error : r.error };
    pages.push(r.data.text.replace(/\[unreadable\]/g, ' ').trim());
  }
  const chunks = chunkPages(pages);
  if (!chunks.length) return { ok: false, error: 'No text could be read from these pictures. Please try clearer, well-lit photos.' };
  return { ok: true, data: { kind: 'image', sourceName: files.length === 1 ? (files[0].name || 'photo').slice(0, 200) : files.length + ' photos', pages: files.length, chunks, note: 'Read from photos by AI: please check the words that matter.', suggestedTitle: 'Notes from photos' } };
}

export function preparePasted(text: string): Result<Prepared> {
  const chunks = chunkText(text);
  if (!chunks.length) return { ok: false, error: 'Please paste some text first.' };
  return { ok: true, data: { kind: 'notes', sourceName: '', pages: null, chunks, note: '', suggestedTitle: '' } };
}

// Saves a prepared document: creates it, sends the pieces in small batches, finishes it. If anything fails after it was created, it is removed again.
export async function saveMaterial(p: { title: string; subjectId: string | null; kind?: MaterialKind; prepared: Prepared }, onProgress: Progress): Promise<Result<StudyMaterial>> {
  const { prepared } = p;
  const fit = fitToLimit(prepared.chunks);
  if (!fit.chunks.length) return { ok: false, error: 'There is nothing to save.' };
  const made = await studyApi.createMaterial(p.title.trim() || prepared.suggestedTitle || 'My notes', p.subjectId, p.kind || prepared.kind, prepared.sourceName, prepared.pages, newRef());
  if (!made.ok) return made;
  const id = made.data.id;
  const groups = batches(fit.chunks, BATCH_SIZE);
  for (let i = 0; i < groups.length; i++) {
    onProgress('Saving… ' + Math.round((i / groups.length) * 100) + '%', i / groups.length);
    const r = await studyApi.addChunks(id, groups[i]);
    if (!r.ok) { await studyApi.deleteMaterial(id); return { ok: false, error: r.error }; }
  }
  const note = [prepared.note, fit.cut ? 'This document was very long, so only the first part was kept.' : ''].filter(Boolean).join(' ');
  const done = await studyApi.finishMaterial(id, note);
  if (!done.ok) { await studyApi.deleteMaterial(id); return { ok: false, error: done.error }; }
  return done;
}
