// Lines shown on the loading page. Only (a) well-known quotations from authors whose work is in the public domain, with their name, and (b) NOOB's own lines.
// Each is at most 90 characters. One is picked at random per start and it is never the same one as last time.

export interface LoadingQuote { text: string; author: string }

export const LOADING_QUOTES: LoadingQuote[] = [
  { text: 'The journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'Mastering others is strength; mastering yourself is true power.', author: 'Lao Tzu' },
  { text: 'To know what you know and what you do not know, that is true knowledge.', author: 'Confucius' },
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'While we are postponing, life speeds by.', author: 'Seneca' },
  { text: 'It is not that we have a short time to live, but that we waste much of it.', author: 'Seneca' },
  { text: 'Very little is needed to make a happy life.', author: 'Marcus Aurelius' },
  { text: 'The best revenge is not to be like your enemy.', author: 'Marcus Aurelius' },
  { text: 'No act of kindness, no matter how small, is ever wasted.', author: 'Aesop' },
  { text: 'Slow and steady wins the race.', author: 'Aesop' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'Lost time is never found again.', author: 'Benjamin Franklin' },
  { text: 'The only way to have a friend is to be one.', author: 'Ralph Waldo Emerson' },
  { text: 'Nothing great was ever achieved without enthusiasm.', author: 'Ralph Waldo Emerson' },
  { text: 'The reward of a thing well done is to have done it.', author: 'Ralph Waldo Emerson' },
  { text: 'Courage is resistance to fear, mastery of fear, not absence of fear.', author: 'Mark Twain' },
  { text: 'How vain it is to sit down to write when you have not stood up to live.', author: 'Henry David Thoreau' },
  { text: 'Things do not change; we change.', author: 'Henry David Thoreau' },
  { text: 'Things which matter most must never be at the mercy of things which matter least.', author: 'Goethe' },
  { text: 'Where the spirit does not work with the hand, there is no art.', author: 'Leonardo da Vinci' },
  { text: 'Brevity is the soul of wit.', author: 'William Shakespeare' },
  { text: 'Love all, trust a few, do wrong to none.', author: 'William Shakespeare' },
  { text: 'There is nothing either good or bad, but thinking makes it so.', author: 'William Shakespeare' },
  { text: 'Let me not pray to be sheltered from dangers, but to be fearless in facing them.', author: 'Rabindranath Tagore' },
  { text: 'Faith is the bird that feels the light and sings when the dawn is still dark.', author: 'Rabindranath Tagore' },
  { text: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda' },
  { text: 'We are what our thoughts have made us; so take care about what you think.', author: 'Swami Vivekananda' },
  { text: 'Good friends make every day a good day.', author: 'NOOB' },
  { text: 'Share the small wins. They add up.', author: 'NOOB' },
  { text: 'A kind comment costs nothing and lasts all day.', author: 'NOOB' },
  { text: 'Study a little, laugh a lot, repeat tomorrow.', author: 'NOOB' },
  { text: 'Your people are only one tap away.', author: 'NOOB' },
  { text: 'Be the reason someone smiles today.', author: 'NOOB' },
  { text: 'Ask the question. Someone else was wondering too.', author: 'NOOB' },
  { text: 'Every expert on NOOB started as a beginner.', author: 'NOOB' },
  { text: 'Cheer for your friends out loud.', author: 'NOOB' },
  { text: 'Take a break, drink some water, come back brighter.', author: 'NOOB' },
  { text: 'Big things grow from small steps, taken together.', author: 'NOOB' },
  { text: 'Be curious. Be kind. Be NOOB.', author: 'NOOB' },
  { text: 'A good day starts with a good hello.', author: 'NOOB' },
  { text: 'Make something today that you are proud of.', author: 'NOOB' },
];

export const LAST_QUOTE_KEY = 'noob_loading_quote_last';

/** Picks an index at random that is not `last` (when there is more than one quote). */
export const pickQuoteIndex = (count: number, last: number | null, random: () => number = Math.random): number => {
  if (count <= 1) return 0;
  let i = Math.min(count - 1, Math.floor(random() * count));
  if (i === last) i = (i + 1 + Math.floor(random() * (count - 1))) % count;
  return i;
};

let picked: LoadingQuote | null = null;

/** The quote for this start of the app (the same one on every loading page until the app is opened again). */
export const getLoadingQuote = (): LoadingQuote => {
  if (picked) return picked;
  let last: number | null = null;
  try { const v = localStorage.getItem(LAST_QUOTE_KEY); if (v !== null && /^\d+$/.test(v)) last = Number(v); } catch { /* storage blocked: any quote will do */ }
  const i = pickQuoteIndex(LOADING_QUOTES.length, last);
  try { localStorage.setItem(LAST_QUOTE_KEY, String(i)); } catch { /* storage blocked */ }
  picked = LOADING_QUOTES[i];
  return picked;
};
