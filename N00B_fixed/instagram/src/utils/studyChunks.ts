// NOOB STUDY: turning a student's document into small searchable pieces. Pure text work (no browser, no network), tested on its own.
// A piece is about a paragraph long, so a search or a question finds the right spot and the tutor can say "page 4".

export interface TextChunk { page: number | null; text: string }
export const CHUNK_TARGET = 1100;      // a piece is closed once it reaches about this many letters
export const CHUNK_MAX = 1800;         // and is never longer than this (the database allows 4000)
export const BATCH_SIZE = 30;          // pieces sent to the server in one call (it allows 40)

// Safe text: no control characters (the database cannot hold them), no broken emoji halves, tidy spaces, and words that a line break split in two put back together.
export function cleanText(input: string): string {
  let s = String(input ?? '');
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​‌﻿]/g, '');
  s = s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/([a-z])-\n([a-z])/g, '$1$2');           // "exam-\nple" -> "example"
  s = s.replace(/[ \t ]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// a long run of text cut at the nearest sentence end (or word) before `max`
function cutLong(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let at = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf('। '), window.lastIndexOf('\n'));
    if (at < max * 0.5) at = window.lastIndexOf(' ');
    if (at < max * 0.3) at = max - 1;
    out.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function chunkText(text: string, page: number | null = null, target = CHUNK_TARGET, max = CHUNK_MAX): TextChunk[] {
  const clean = cleanText(text);
  if (!clean) return [];
  const paras = clean.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const pieces: string[] = [];
  let cur = '';
  const flush = () => { if (cur.trim()) pieces.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    for (const part of p.length > max ? cutLong(p, max) : [p]) {
      if (cur && cur.length + part.length + 1 > max) flush();
      cur = cur ? cur + '\n' + part : part;
      if (cur.length >= target) flush();
    }
  }
  flush();
  return pieces.map((t) => ({ page, text: t }));
}

// pages of text (the first is page 1) -> pieces that remember their page
export function chunkPages(pages: string[]): TextChunk[] {
  const out: TextChunk[] = [];
  pages.forEach((t, i) => { out.push(...chunkText(t, i + 1)); });
  return out;
}

export const lettersIn = (chunks: TextChunk[]): number => chunks.reduce((a, c) => a + c.text.length, 0);

export function batches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The server keeps 800,000 letters per document. A document longer than that is cut here, at a piece boundary, and the student is told.
export const MAX_LETTERS = 800000;
export function fitToLimit(chunks: TextChunk[], max = MAX_LETTERS): { chunks: TextChunk[]; cut: boolean } {
  let used = 0;
  const kept: TextChunk[] = [];
  for (const c of chunks) { if (used + c.text.length > max) return { chunks: kept, cut: true }; kept.push(c); used += c.text.length; }
  return { chunks: kept, cut: false };
}
