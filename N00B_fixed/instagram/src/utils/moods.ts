// The eight moods of Mood Status, in the order they are offered. The id is what the database stores (and checks); the emoji and the label are only how it is shown.
export type MoodId = 'happy' | 'confident' | 'tired' | 'sad' | 'angry' | 'excited' | 'bored' | 'loved';
export type MoodVisibility = 'everyone' | 'followers' | 'only_me';

export const MOODS: ReadonlyArray<{ id: MoodId; emoji: string; label: string }> = [
  { id: 'happy', emoji: '\u{1F60A}', label: 'Happy' },
  { id: 'confident', emoji: '\u{1F60E}', label: 'Confident' },
  { id: 'tired', emoji: '\u{1F634}', label: 'Tired' },
  { id: 'sad', emoji: '\u{1F614}', label: 'Sad' },
  { id: 'angry', emoji: '\u{1F621}', label: 'Angry' },
  { id: 'excited', emoji: '\u{1F929}', label: 'Excited' },
  { id: 'bored', emoji: '\u{1F636}', label: 'Bored' },
  { id: 'loved', emoji: '❤️', label: 'Loved' }
];

export const moodInfo = (id: string): { id: MoodId; emoji: string; label: string } => MOODS.find((m) => m.id === id) ?? { id: 'happy', emoji: '•', label: id };

export const VISIBILITY_OPTIONS: ReadonlyArray<{ id: MoodVisibility; label: string; hint: string }> = [
  { id: 'followers', label: 'Followers', hint: 'People who follow you' },
  { id: 'everyone', label: 'Everyone', hint: 'Anyone who can see your profile' },
  { id: 'only_me', label: 'Only me', hint: 'A private note to yourself' }
];

export const EXPIRY_OPTIONS: ReadonlyArray<{ hours: number | null; label: string }> = [
  { hours: 24, label: 'Clear after 24 hours' },
  { hours: null, label: 'Keep until I change it' }
];

export const MOOD_NOTE_MAX = 80;
