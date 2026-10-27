// The small pure parts of the Notepad (no network, no storage): the title of a note, its counts and the search. Used by services/notesApi.ts and the tests.
export interface Note { id: string; body: string; createdAt: string; updatedAt: string }
export const NOTE_MAX_CHARS = 100000;

export const noteTitle = (body: string): string => {
  const first = (body || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return first ? (first.length > 48 ? first.slice(0, 48) + '…' : first) : 'Empty note';
};
export const noteStats = (body: string): { words: number; chars: number; lines: number } => ({
  words: (body.trim().match(/\S+/g) || []).length, chars: body.length, lines: body ? body.split(/\r?\n/).length : 0
});
export const filterNotes = (notes: Note[], q: string): Note[] => {
  const t = q.trim().toLowerCase();
  return t ? notes.filter((n) => n.body.toLowerCase().includes(t)) : notes;
};
