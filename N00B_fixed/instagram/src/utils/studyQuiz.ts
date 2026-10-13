import type { QuizQuestion, StudyCard } from './studyTypes';

// NOOB STUDY practice, on the phone: checking an answer the moment the student gives it, and showing when a flashcard will come back.
// These follow the SAME rules as the database (which does the real, saved marking and the real scheduling), so what the student sees first is what is kept.
// Pure, and tested against the database's own numbers.

// "  NEWTON. " and "newton" are the same answer: capital letters, punctuation and extra spaces do not matter
export const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[!-/:-@[-`{-~]/g, ' ').replace(/\s+/g, ' ').trim();

// the number at the start of what was typed: "1,200", "6 N", "-3", "2e3". Anything else is not a number.
export function parseNumber(s: unknown): number | null {
  const t = String(s ?? '').replace(/,/g, '').replace(/ /g, '');
  const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(t);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export const isOpenQuestion = (q: QuizQuestion): boolean => q.type === 'short' || q.type === 'case';

// true / false for a question with one right answer; null for a written answer (the student marks that against the model answer)
export function checkObjective(q: QuizQuestion, answer: unknown): boolean | null {
  if (isOpenQuestion(q)) return null;
  if (answer === null || answer === undefined || String(answer).trim() === '') return false;
  switch (q.type) {
    case 'mcq': return typeof answer === 'number' && answer === q.answer;
    case 'tf': return typeof answer === 'boolean' && answer === q.answer;
    case 'numerical': {
      const v = parseNumber(answer), a = Number(q.answer);
      // (a hair of slack: decimals such as 0.505 - 0.5 are not exact in a phone's arithmetic, but are in the database's)
      return v !== null && Number.isFinite(a) && Math.abs(v - a) <= Math.max(0.000001, Math.abs(a) * 0.01) + 1e-9;
    }
    case 'fill': return norm(answer) === norm(q.answer);
    default: return false;
  }
}

// the right answer written out (as the list of mistakes shows it)
export function answerText(q: QuizQuestion): string {
  switch (q.type) {
    case 'mcq': return (q.options || [])[Number(q.answer)] || '';
    case 'tf': return q.answer ? 'True' : 'False';
    case 'numerical': return String(q.answer) + (q.unit ? ' ' + q.unit : '');
    default: return String(q.answer ?? '');
  }
}

// kind words for any score: never harsh, never false
export function percentMessage(p: number): string {
  if (p >= 90) return 'Excellent work. This is solid.';
  if (p >= 70) return 'Good job. A little more and it is yours.';
  if (p >= 50) return 'A fair start. The mistakes below are your next steps.';
  return 'This one was hard, and that is okay. Every mistake you look at now is one you will not make in the exam.';
}

export const QUESTION_LABEL: Record<string, string> = { mcq: 'Multiple choice', tf: 'True or false', numerical: 'Number', fill: 'Fill in the blank', short: 'Short answer', case: 'Case or long answer' };

// ---- flashcards: the same SM-2 as the database. quality 1 = again, 2 = hard, 3 = good, 4 = easy.
export interface CardState { reps: number; intervalDays: number; ease: number; lapses: number }
export interface CardNext extends CardState { dueInMinutes: number }
export function nextCard(card: CardState, quality: 1 | 2 | 3 | 4): CardNext {
  const q = quality === 1 ? 1 : quality === 2 ? 3 : quality === 3 ? 4 : 5;
  if (q < 3) return { reps: 0, intervalDays: 0, ease: Math.max(1.3, round2(card.ease - 0.2)), lapses: card.lapses + 1, dueInMinutes: 10 };
  const reps = card.reps + 1;
  const ease = Math.min(4, Math.max(1.3, round2(card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))));
  let days = reps === 1 ? 1 : reps === 2 ? 6 : Math.max(card.intervalDays + 1, Math.round(card.intervalDays * ease));
  days = Math.min(days, 3650);
  return { reps, intervalDays: days, ease, lapses: card.lapses, dueInMinutes: days * 1440 };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function waitLabel(minutes: number): string {
  if (minutes < 60) return minutes + ' min';
  const days = Math.round(minutes / 1440);
  if (days < 1) return Math.round(minutes / 60) + ' h';
  if (days < 30) return days + (days === 1 ? ' day' : ' days');
  if (days < 365) { const m = Math.round(days / 30); return m + (m === 1 ? ' month' : ' months'); }
  const y = Math.round((days / 365) * 10) / 10;
  return y + (y === 1 ? ' year' : ' years');
}

// what each button will do, written on the button ("Good: 6 days")
export function previewWaits(card: Pick<StudyCard, 'reps' | 'intervalDays' | 'lapses'> & { ease?: number }): Record<1 | 2 | 3 | 4, string> {
  const s: CardState = { reps: card.reps, intervalDays: card.intervalDays, ease: card.ease ?? 2.5, lapses: card.lapses };
  return { 1: waitLabel(nextCard(s, 1).dueInMinutes), 2: waitLabel(nextCard(s, 2).dueInMinutes), 3: waitLabel(nextCard(s, 3).dueInMinutes), 4: waitLabel(nextCard(s, 4).dueInMinutes) };
}

// pasted lines "front - back", "front: back" or "front<TAB>back" become cards (a quick way to type many)
export function parseCardLines(text: string): Array<{ front: string; back: string }> {
  const out: Array<{ front: string; back: string }> = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)(?:\t|\s+[-–—]\s+|\s*::\s*|\s*[:=]\s+)(.+)$/.exec(line);
    if (m && m[1].trim() && m[2].trim()) out.push({ front: m[1].trim().slice(0, 300), back: m[2].trim().slice(0, 600) });
  }
  return out.slice(0, 60);
}
