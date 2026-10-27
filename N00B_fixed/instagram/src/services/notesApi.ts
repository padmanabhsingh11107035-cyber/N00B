import { supabase } from './supabase';

// The Notepad (profile menu > Settings and activity > Notepad): each person's own text notes. They sit in the profile_notes table, which only its owner can read or change
// (row-level security, migration 20261027000005); the owner's id is filled in by the database itself.
export { NOTE_MAX_CHARS, noteTitle, noteStats, filterNotes, type Note } from '../utils/notes';
import { NOTE_MAX_CHARS, type Note } from '../utils/notes';

const toNote = (r: { id: string; body: string; created_at: string; updated_at: string }): Note => ({ id: r.id, body: r.body ?? '', createdAt: r.created_at, updatedAt: r.updated_at });

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await supabase.from('profile_notes').select('id, body, created_at, updated_at').order('updated_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return (data || []).map(toNote);
}
export async function createNote(body = ''): Promise<Note> {
  const { data, error } = await supabase.from('profile_notes').insert({ body: body.slice(0, NOTE_MAX_CHARS) }).select('id, body, created_at, updated_at').single();
  if (error || !data) throw new Error(error?.message || 'Could not make a new note.');
  return toNote(data);
}
export async function saveNote(id: string, body: string): Promise<string> {
  const { data, error } = await supabase.from('profile_notes').update({ body: body.slice(0, NOTE_MAX_CHARS) }).eq('id', id).select('updated_at').single();
  if (error) throw new Error(error.message);
  return data?.updated_at ?? new Date().toISOString();
}
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('profile_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
