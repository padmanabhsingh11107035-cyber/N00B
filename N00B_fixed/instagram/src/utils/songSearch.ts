// "Search song": the phone listens for a few seconds to a song playing somewhere (another phone, a speaker, a TV) and the server finds its name.
// Pure helpers (no microphone here) so each rule can be tested; the page that uses the microphone is components/Settings/pages/searchsong.tsx.

export const LISTEN_SECONDS = 12;
export const MIN_LISTEN_SECONDS = 5;

/** The recording format this phone can make (Chrome and Android: webm; iPhone and Safari: mp4). Null when it can make none. */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const m of candidates) {
    try { if (isSupported(m)) return m; } catch { /* not this one */ }
  }
  return null;
}

export type SongAnswer =
  | { kind: 'found'; song: { title: string; artist: string; album?: string; releaseDate?: string; label?: string; cover?: string; links: { apple?: string; spotify?: string; other?: string } } }
  | { kind: 'notFound' }
  | { kind: 'tooShort' }
  | { kind: 'notSetUp' }
  | { kind: 'limited' }
  | { kind: 'failed' };

/** What the server answered (or the connection failed with), as one clear outcome the page can show in words. */
export function readSongAnswer(data: any, failed: boolean): SongAnswer {
  if (failed || !data || typeof data !== 'object') return { kind: 'failed' };
  if (data.configured === false || data.unavailable === true) return { kind: 'notSetUp' };
  if (data.limited === true) return { kind: 'limited' };
  if (data.tooShort === true) return { kind: 'tooShort' };
  if (data.failed === true) return { kind: 'failed' };
  if (data.found === true && data.song && data.song.title) return { kind: 'found', song: { ...data.song, artist: data.song.artist || '', links: data.song.links || {} } };
  return { kind: 'notFound' };
}

/** The words shown for each outcome. A song that is not found is told politely, never as an error. */
export function songMessage(a: SongAnswer): { title: string; text: string } {
  switch (a.kind) {
    case 'found': return { title: a.song.title, text: a.song.artist ? `by ${a.song.artist}` : '' };
    case 'notFound': return { title: 'We could not find that song', text: 'Sorry, the content you searched for was not found. Try again closer to the sound, with less noise around, or when the chorus is playing.' };
    case 'tooShort': return { title: 'That was too short or too quiet', text: 'We could not hear enough. Hold your phone near the sound and listen for the full time.' };
    case 'notSetUp': return { title: 'Song search is being set up', text: 'This feature is not switched on yet. Please try again a little later.' };
    case 'limited': return { title: 'You have searched a lot', text: 'Please wait a little and try again.' };
    default: return { title: 'Something went wrong', text: 'We could not search just now. Please check your internet and try again.' };
  }
}

/** A recording as base64 (what the server asks for), without the "data:" front part. */
export function base64FromDataUrl(url: string): string {
  const i = url.indexOf(',');
  return i >= 0 ? url.slice(i + 1) : '';
}

/** The loudness of one moment, 0 to 1, from the microphone's own frequency picture (for the moving bars while listening). */
export function loudness(bytes: ArrayLike<number>): number {
  if (!bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum += bytes[i];
  return Math.min(1, sum / bytes.length / 128);
}
