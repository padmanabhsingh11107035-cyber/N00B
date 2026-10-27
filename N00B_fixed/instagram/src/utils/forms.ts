// NOOB Forms, the parts that need no screen (so they can be tested): the question types, the themes, the templates, the one "show if" rule (the database applies the
// same rule, see migration 20261028000001), checking answers, the numbers behind the charts (counts, averages, NPS) and the CSV / JSON export.

export type QType =
  | 'short' | 'paragraph' | 'email' | 'phone' | 'url' | 'number'
  | 'multiple_choice' | 'checkboxes' | 'dropdown'
  | 'scale' | 'rating' | 'nps' | 'date' | 'time' | 'consent'
  | 'section' | 'text_block';

export interface FormOption { id: string; label: string }
export interface ShowIf { q: string; op: 'eq' | 'neq' | 'contains' | 'empty' | 'notEmpty' | 'gt' | 'lt'; value?: string | number }
export interface FormQuestion {
  id: string; type: QType; title: string; description?: string; required?: boolean;
  options?: FormOption[]; allowOther?: boolean;
  min?: number; max?: number; minLabel?: string; maxLabel?: string; placeholder?: string;
  showIf?: ShowIf | null;
}
export type Presentation = 'classic' | 'pages' | 'conversational';
export interface FormSettings {
  presentation?: Presentation; showProgress?: boolean; numbering?: boolean;
  confirmMessage?: string; redirectUrl?: string; closedMessage?: string;
  opensAt?: string | null; closesAt?: string | null; maxResponses?: number | null; collectCampaign?: boolean;
}
export interface FormTheme { id?: string; primary?: string; background?: string; text?: string; font?: string; radius?: number }
export interface FormDraft { questions: FormQuestion[]; settings: FormSettings; theme: FormTheme }

export const QTYPES: ReadonlyArray<{ type: QType; label: string; group: string; hint: string }> = [
  { type: 'short', label: 'Short answer', group: 'Text', hint: 'One line' },
  { type: 'paragraph', label: 'Paragraph', group: 'Text', hint: 'Long answer' },
  { type: 'email', label: 'Email', group: 'Text', hint: 'Checked for a real address' },
  { type: 'phone', label: 'Phone number', group: 'Text', hint: 'Digits, +, ( ) -' },
  { type: 'url', label: 'Web link', group: 'Text', hint: 'Starts with http(s)://' },
  { type: 'number', label: 'Number', group: 'Text', hint: 'With a smallest and a largest' },
  { type: 'multiple_choice', label: 'Multiple choice', group: 'Choice', hint: 'Pick one' },
  { type: 'checkboxes', label: 'Checkboxes', group: 'Choice', hint: 'Pick many' },
  { type: 'dropdown', label: 'Dropdown', group: 'Choice', hint: 'Pick one from a list' },
  { type: 'scale', label: 'Linear scale', group: 'Rating', hint: '1 to 5, 1 to 10 ...' },
  { type: 'rating', label: 'Star rating', group: 'Rating', hint: 'Stars' },
  { type: 'nps', label: 'Net Promoter Score', group: 'Rating', hint: '0 to 10: would you recommend us?' },
  { type: 'date', label: 'Date', group: 'Date and time', hint: 'A day' },
  { type: 'time', label: 'Time', group: 'Date and time', hint: 'A time of day' },
  { type: 'consent', label: 'Consent', group: 'More', hint: 'A box people must tick' },
  { type: 'section', label: 'New page / section', group: 'Layout', hint: 'Starts a new page' },
  { type: 'text_block', label: 'Text block', group: 'Layout', hint: 'Words, no answer' }
];
export const isAnswerable = (t: QType): boolean => t !== 'section' && t !== 'text_block';
export const hasOptions = (t: QType): boolean => t === 'multiple_choice' || t === 'checkboxes' || t === 'dropdown';

export const newId = (): string => 'q' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function blankQuestion(type: QType): FormQuestion {
  const base: FormQuestion = { id: newId(), type, title: type === 'section' ? 'New page' : type === 'text_block' ? 'Text' : 'Untitled question', required: false };
  if (hasOptions(type)) base.options = [{ id: newId(), label: 'Option 1' }, { id: newId(), label: 'Option 2' }];
  if (type === 'scale') Object.assign(base, { min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very much' });
  if (type === 'rating') Object.assign(base, { min: 1, max: 5 });
  if (type === 'nps') Object.assign(base, { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' });
  if (type === 'consent') base.title = 'I agree';
  return base;
}

/** Changing the type keeps the title, the note and "required"; options only stay where options make sense; anything that does not fit is dropped (the editor warns first). */
export function changeType(q: FormQuestion, type: QType): FormQuestion {
  const fresh = blankQuestion(type);
  const keep: FormQuestion = { ...fresh, id: q.id, title: q.title, description: q.description, required: q.required, showIf: q.showIf ?? null };
  if (hasOptions(type) && q.options?.length) keep.options = q.options;
  return keep;
}
export function losesSettings(q: FormQuestion, type: QType): boolean {
  return (!!q.options?.length && !hasOptions(type)) || (q.min != null && !['scale', 'rating', 'nps', 'number', 'short', 'paragraph'].includes(type));
}

// ---------------------------------------------------------------- the "show if" rule (the same one the database uses)
const isEmptyAnswer = (a: unknown) => a == null || a === '' || (Array.isArray(a) && a.length === 0);
export function isVisible(q: FormQuestion, answers: Record<string, unknown>): boolean {
  const c = q.showIf;
  if (!c || !c.q) return true;
  const a = answers[c.q], v = c.value;
  if (c.op === 'empty') return isEmptyAnswer(a);
  if (c.op === 'notEmpty') return !isEmptyAnswer(a);
  if (a == null) return c.op === 'neq';
  const has = (x: unknown) => a === x || (Array.isArray(a) && a.includes(x as never));
  if (c.op === 'eq') return has(v);
  if (c.op === 'neq') return !has(v);
  if (c.op === 'contains') return Array.isArray(a) ? a.includes(v as never) : typeof a === 'string' && a.toLowerCase().includes(String(v ?? '').toLowerCase());
  if ((c.op === 'gt' || c.op === 'lt') && typeof a === 'number' && typeof v === 'number') return c.op === 'gt' ? a > v : a < v;
  return true;
}

/** Problems with the logic of a form: a rule that points at a question that is gone, at itself, or at a question that comes LATER (it could never be answered first). */
export function logicProblems(qs: FormQuestion[]): string[] {
  const out: string[] = [];
  qs.forEach((q, i) => {
    const c = q.showIf; if (!c) return;
    const at = qs.findIndex((x) => x.id === c.q);
    if (at < 0) out.push(`"${q.title}" depends on a question that no longer exists`);
    else if (at >= i) out.push(`"${q.title}" depends on a question that comes after it`);
  });
  return out;
}

// ---------------------------------------------------------------- checking answers in the browser (the database checks them again)
export function checkAnswer(q: FormQuestion, a: unknown): string | null {
  if (!isAnswerable(q.type)) return null;
  if (isEmptyAnswer(a) || (q.type === 'consent' && a !== true)) return q.required ? (q.type === 'consent' ? 'Please tick the box to continue' : 'This question is required') : null;
  const text = typeof a === 'string' ? a : '';
  switch (q.type) {
    case 'short': case 'paragraph':
      if (text.length > (q.type === 'paragraph' ? 5000 : 500)) return 'This answer is too long';
      if (q.min != null && text.length < q.min) return `Please write at least ${q.min} characters`;
      if (q.max != null && text.length > q.max) return `Please keep it under ${q.max} characters`;
      return null;
    case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? null : 'Please enter a valid email address';
    case 'url': return /^https?:\/\/[^\s]+$/i.test(text) ? null : 'Please enter a link that starts with http:// or https://';
    case 'phone': return /^[0-9+()\-\s]{6,20}$/.test(text) ? null : 'Please enter a valid phone number';
    case 'number':
      if (typeof a !== 'number' || !Number.isFinite(a)) return 'Please enter a number';
      if (q.min != null && a < q.min) return `The smallest number is ${q.min}`;
      if (q.max != null && a > q.max) return `The largest number is ${q.max}`;
      return null;
    case 'multiple_choice': case 'dropdown':
      return typeof a === 'string' && (q.options?.some((o) => o.id === a) || (q.allowOther && a.startsWith('other:'))) ? null : 'Please choose one of the options';
    case 'checkboxes':
      if (!Array.isArray(a)) return 'Please choose from the options';
      if (!a.every((x) => typeof x === 'string' && (q.options?.some((o) => o.id === x) || (q.allowOther && x.startsWith('other:'))))) return 'Please choose from the options';
      if (q.min != null && a.length < q.min) return `Choose at least ${q.min}`;
      if (q.max != null && a.length > q.max) return `Choose at most ${q.max}`;
      return null;
    case 'scale': case 'rating': case 'nps': {
      const lo = q.min ?? (q.type === 'nps' ? 0 : 1), hi = q.max ?? (q.type === 'nps' ? 10 : 5);
      return typeof a === 'number' && Number.isInteger(a) && a >= lo && a <= hi ? null : `Please choose from ${lo} to ${hi}`;
    }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(text) ? null : 'Please choose a date';
    case 'time': return /^\d{2}:\d{2}$/.test(text) ? null : 'Please choose a time';
    default: return null;
  }
}

/** The questions that count for these answers (the visible ones), in the order of the form. */
export const visibleQuestions = (qs: FormQuestion[], answers: Record<string, unknown>) => qs.filter((q) => isVisible(q, answers));

/** The pages of a form: all in one (classic), split at every "new page" (pages), or one question each (conversational). Hidden questions never make a page. */
export function pagesOf(qs: FormQuestion[], answers: Record<string, unknown>, mode: Presentation): FormQuestion[][] {
  const vis = visibleQuestions(qs, answers);
  if (mode === 'classic') return [vis.filter((q) => q.type !== 'section')];
  if (mode === 'conversational') return vis.filter((q) => q.type !== 'section').map((q) => [q]);
  const pages: FormQuestion[][] = [[]];
  for (const q of vis) { if (q.type === 'section' && pages[pages.length - 1].length) pages.push([q]); else pages[pages.length - 1].push(q); }
  return pages.filter((p) => p.length);
}

// ---------------------------------------------------------------- themes
export interface ThemeTokens { name: string; bg: string; card: string; text: string; muted: string; primary: string; onPrimary: string; border: string; font: string; radius: number }
const F_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const F_SERIF = 'Georgia, "Times New Roman", serif';
const F_ROUND = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const T = (name: string, bg: string, card: string, text: string, muted: string, primary: string, onPrimary: string, border: string, font = F_SANS, radius = 14): ThemeTokens => ({ name, bg, card, text, muted, primary, onPrimary, border, font, radius });
export const THEMES: Record<string, ThemeTokens> = {
  classic: T('Classic Light', '#f0ebf8', '#ffffff', '#202124', '#5f6368', '#673ab7', '#ffffff', '#dadce0', F_SANS, 8),
  minimal: T('Minimal White', '#ffffff', '#ffffff', '#111111', '#6b7280', '#111111', '#ffffff', '#e5e7eb', F_SANS, 6),
  midnight: T('Midnight Dark', '#0b0d12', '#151922', '#f3f4f6', '#9ca3af', '#8b5cf6', '#ffffff', '#262b36', F_SANS, 16),
  ocean: T('Ocean Blue', '#e0f2fe', '#ffffff', '#0c4a6e', '#475569', '#0284c7', '#ffffff', '#bae6fd'),
  forest: T('Forest Green', '#e8f3ea', '#ffffff', '#14391f', '#4b6353', '#2f855a', '#ffffff', '#c6e0cd'),
  sunset: T('Sunset Orange', '#fff1e6', '#ffffff', '#431407', '#78523b', '#ea580c', '#ffffff', '#fed7aa'),
  lavender: T('Lavender', '#f3e8ff', '#ffffff', '#3b0764', '#6b5b7b', '#9333ea', '#ffffff', '#e9d5ff'),
  rose: T('Rose Pink', '#ffe4ec', '#ffffff', '#4c0519', '#7a4a57', '#e11d48', '#ffffff', '#fecdd3'),
  business: T('Professional Business', '#eef1f5', '#ffffff', '#1f2937', '#64748b', '#334155', '#ffffff', '#d5dbe3', F_SANS, 6),
  navy: T('Corporate Navy', '#0f1e3d', '#16294d', '#f1f5f9', '#a5b4cf', '#38bdf8', '#06243a', '#27406e', F_SANS, 8),
  pastel: T('Soft Pastel', '#fdf2f8', '#ffffff', '#4a3b52', '#85748c', '#c084fc', '#ffffff', '#f5d0fe', F_ROUND, 22),
  warm: T('Warm Neutral', '#f6f1e9', '#fffdf8', '#3d3328', '#7b6c5a', '#a8643a', '#ffffff', '#e7dccb', F_SERIF, 12),
  gradient: T('Gradient Modern', 'linear-gradient(135deg,#6366f1,#ec4899)', '#ffffff', '#1e1b4b', '#6b7280', '#6366f1', '#ffffff', '#e0e7ff', F_SANS, 20),
  contrast: T('High Contrast', '#000000', '#000000', '#ffffff', '#e5e5e5', '#ffff00', '#000000', '#ffffff', F_SANS, 4),
  elegant: T('Elegant Serif', '#f5f1ea', '#ffffff', '#2b2118', '#6f6254', '#7c2d12', '#ffffff', '#e4d9c8', F_SERIF, 4),
  playful: T('Playful Colorful', '#fff7cc', '#ffffff', '#1f2937', '#6b7280', '#f43f5e', '#ffffff', '#fde68a', F_ROUND, 26),
  education: T('Education', '#e8f5ff', '#ffffff', '#12304a', '#53718a', '#1d70b8', '#ffffff', '#c7e0f4', F_ROUND, 12),
  event: T('Event Celebration', '#1a0b2e', '#2a1245', '#fdf4ff', '#d4b5ee', '#f0abfc', '#3b0764', '#4a2470', F_ROUND, 20),
  launch: T('Product Launch', '#06080f', '#0f1424', '#e6edf7', '#8a99b3', '#22d3ee', '#04222b', '#1e2a45', F_SANS, 14),
  noob: T('NOOB Signature', '#0a0a0a', '#151515', '#ffffff', '#a1a1aa', '#22f23c', '#032b0a', '#2a2a2a', F_SANS, 18)
};
export const THEME_FONTS: Record<string, string> = { Default: '', Sans: F_SANS, Serif: F_SERIF, Rounded: F_ROUND, Mono: 'ui-monospace, Menlo, Consolas, monospace' };

export function resolveTheme(t?: FormTheme | null): ThemeTokens {
  const base = THEMES[t?.id ?? 'classic'] ?? THEMES.classic;
  const hex = (v?: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  const primary = hex(t?.primary) ?? base.primary;
  return { ...base, primary, onPrimary: hex(t?.primary) ? readableOn(primary) : base.onPrimary, bg: hex(t?.background) ?? base.bg, text: hex(t?.text) ?? base.text, font: t?.font || base.font, radius: typeof t?.radius === 'number' ? Math.max(0, Math.min(32, t.radius)) : base.radius };
}
const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrastRatio = (a: string, b: string): number => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const readableOn = (bg: string): string => (contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#000000') ? '#ffffff' : '#000000');

// ---------------------------------------------------------------- templates (real forms, every one editable)
const opt = (...labels: string[]): FormOption[] => labels.map((label) => ({ id: newId(), label }));
const Q = (type: QType, title: string, extra: Partial<FormQuestion> = {}): FormQuestion => ({ ...blankQuestion(type), title, ...extra });
export interface FormTemplate { id: string; name: string; category: string; description: string; build: () => { title: string; description: string; draft: FormDraft } }
const tpl = (id: string, name: string, category: string, description: string, qs: () => FormQuestion[], settings: FormSettings = {}, theme: FormTheme = { id: 'classic' }): FormTemplate => ({
  id, name, category, description, build: () => ({ title: name, description, draft: { questions: qs(), settings: { presentation: 'classic', showProgress: true, ...settings }, theme } })
});
export const TEMPLATES: ReadonlyArray<FormTemplate> = [
  tpl('contact', 'Contact form', 'Business', 'Let people write to you.', () => [Q('short', 'Your name', { required: true }), Q('email', 'Email address', { required: true }), Q('phone', 'Phone number (optional)'), Q('dropdown', 'What is this about?', { options: opt('General question', 'Support', 'Partnership', 'Other'), required: true }), Q('paragraph', 'Your message', { required: true })]),
  tpl('feedback', 'Customer feedback', 'Feedback', 'Find out how customers feel.', () => [Q('rating', 'How would you rate your experience?', { required: true }), Q('multiple_choice', 'How did you hear about us?', { options: opt('Friends', 'Social media', 'Search', 'Other') }), Q('checkboxes', 'What did you like?', { options: opt('Quality', 'Price', 'Service', 'Delivery') }), Q('paragraph', 'Anything we can improve?')], {}, { id: 'ocean' }),
  tpl('nps', 'Net Promoter Score survey', 'Feedback', 'One question that measures loyalty.', () => [Q('nps', 'How likely are you to recommend us to a friend?', { required: true }), Q('paragraph', 'What is the main reason for your score?')], {}, { id: 'launch' }),
  tpl('csat', 'Customer satisfaction', 'Feedback', 'Short satisfaction survey.', () => [Q('scale', 'Overall, how satisfied are you?', { required: true, min: 1, max: 5, minLabel: 'Very unhappy', maxLabel: 'Very happy' }), Q('scale', 'How easy was it to get what you needed?', { min: 1, max: 5, minLabel: 'Hard', maxLabel: 'Easy' }), Q('paragraph', 'What could we do better?')]),
  tpl('event', 'Event registration', 'Events', 'Sign people up for your event.', () => [Q('short', 'Full name', { required: true }), Q('email', 'Email', { required: true }), Q('number', 'Number of guests', { min: 1, max: 10, required: true }), Q('checkboxes', 'Which sessions will you join?', { options: opt('Opening', 'Workshop', 'Panel', 'Dinner') }), Q('short', 'Food allergies or needs'), Q('consent', 'I agree to be contacted about this event', { required: true })], {}, { id: 'event' }),
  tpl('rsvp', 'RSVP invitation', 'Events', 'Who is coming?', () => [Q('short', 'Your name', { required: true }), Q('multiple_choice', 'Will you come?', { required: true, options: opt('Yes, I will be there', 'Maybe', 'Sorry, I cannot') }), Q('number', 'How many people with you?', { min: 0, max: 8, showIf: { q: '', op: 'neq', value: '' } }), Q('paragraph', 'A message for the host')], {}, { id: 'rose' }),
  tpl('job', 'Job application', 'Work', 'Collect applications.', () => [Q('section', 'About you'), Q('short', 'Full name', { required: true }), Q('email', 'Email', { required: true }), Q('phone', 'Phone'), Q('section', 'About the job'), Q('dropdown', 'Role you apply for', { options: opt('Designer', 'Developer', 'Marketing', 'Support'), required: true }), Q('number', 'Years of experience', { min: 0, max: 50 }), Q('url', 'Link to your portfolio or LinkedIn'), Q('paragraph', 'Why do you want this job?', { required: true })], { presentation: 'pages' }, { id: 'business' }),
  tpl('employee', 'Employee satisfaction', 'Work', 'Anonymous team survey.', () => [Q('scale', 'I feel valued at work', { min: 1, max: 5, minLabel: 'Disagree', maxLabel: 'Agree', required: true }), Q('scale', 'I have the tools I need', { min: 1, max: 5, minLabel: 'Disagree', maxLabel: 'Agree' }), Q('nps', 'Would you recommend working here?'), Q('paragraph', 'What one thing would improve your work?')], {}, { id: 'navy' }),
  tpl('course', 'Course evaluation', 'Education', 'Students rate a course.', () => [Q('short', 'Course name', { required: true }), Q('rating', 'Overall rating', { required: true }), Q('scale', 'The pace of the course', { min: 1, max: 5, minLabel: 'Too slow', maxLabel: 'Too fast' }), Q('checkboxes', 'What helped you learn?', { options: opt('Lectures', 'Practice', 'Notes', 'Teacher help') }), Q('paragraph', 'Suggestions')], {}, { id: 'education' }),
  tpl('bug', 'Bug report', 'Product', 'Let users report problems.', () => [Q('short', 'What went wrong? (short)', { required: true }), Q('paragraph', 'Steps to repeat it'), Q('multiple_choice', 'How bad is it?', { options: opt('Small', 'Annoying', 'Blocks my work'), required: true }), Q('email', 'Email (so we can answer)')], {}, { id: 'midnight' }),
  tpl('feature', 'Feature request', 'Product', 'What should we build next?', () => [Q('short', 'Your idea in one line', { required: true }), Q('paragraph', 'Tell us more'), Q('scale', 'How important is it to you?', { min: 1, max: 5, minLabel: 'Nice to have', maxLabel: 'Must have' })], {}, { id: 'launch' }),
  tpl('newsletter', 'Newsletter signup', 'Marketing', 'Grow your list.', () => [Q('short', 'First name'), Q('email', 'Email', { required: true }), Q('checkboxes', 'What do you want to read?', { options: opt('News', 'Tips', 'Offers') }), Q('consent', 'I agree to receive emails', { required: true })], {}, { id: 'pastel' }),
  tpl('appointment', 'Appointment request', 'Business', 'Let people ask for a time.', () => [Q('short', 'Your name', { required: true }), Q('phone', 'Phone', { required: true }), Q('date', 'Preferred day', { required: true }), Q('time', 'Preferred time'), Q('paragraph', 'What do you need?')]),
  tpl('volunteer', 'Volunteer registration', 'Community', 'Sign up helpers.', () => [Q('short', 'Full name', { required: true }), Q('email', 'Email', { required: true }), Q('checkboxes', 'Where can you help?', { options: opt('Setup', 'Registration', 'Food', 'Cleanup') }), Q('multiple_choice', 'How much time?', { options: opt('1 hour', '2 to 4 hours', 'A full day') })], {}, { id: 'forest' }),
  tpl('research', 'Research questionnaire', 'Research', 'A simple study survey.', () => [Q('consent', 'I agree to take part in this study', { required: true }), Q('number', 'Your age', { min: 13, max: 100 }), Q('multiple_choice', 'How often do you use social apps?', { options: opt('Every day', 'A few times a week', 'Rarely', 'Never') }), Q('paragraph', 'What do you like most about them?')], { presentation: 'conversational' }, { id: 'warm' }),
  tpl('website', 'Website feedback', 'Feedback', 'How is our website?', () => [Q('rating', 'How easy is the site to use?', { required: true }), Q('multiple_choice', 'Did you find what you wanted?', { options: opt('Yes', 'Partly', 'No') }), Q('paragraph', 'What should we change?')])
];
export const BLANK_DRAFT = (): FormDraft => ({ questions: [Q('short', 'Untitled question')], settings: { presentation: 'classic', showProgress: true }, theme: { id: 'classic' } });

/** A template's "show if" that points at a question must point at a real one: the template builder puts the first choice question's id there (see FormsDashboard). */
export function fixTemplateLogic(qs: FormQuestion[]): FormQuestion[] {
  return qs.map((q, i) => {
    if (q.showIf && q.showIf.q === '') {
      const prev = [...qs.slice(0, i)].reverse().find((x) => x.type === 'multiple_choice');
      return prev ? { ...q, showIf: { q: prev.id, op: 'eq', value: prev.options?.[0]?.id ?? '' } } : { ...q, showIf: null };
    }
    return q;
  });
}

// ---------------------------------------------------------------- the numbers behind the charts
export interface ResponseRow { id: string; created_at: string; answers: Record<string, unknown>; version?: number }
export const optionLabel = (q: FormQuestion, v: unknown): string => {
  if (typeof v !== 'string') return String(v ?? '');
  if (v.startsWith('other:')) return 'Other: ' + v.slice(6);
  return q.options?.find((o) => o.id === v)?.label ?? v;
};

export function countChoices(q: FormQuestion, rows: ResponseRow[]): Array<{ label: string; count: number; pct: number }> {
  const counts = new Map<string, number>();
  (q.options ?? []).forEach((o) => counts.set(o.label, 0));
  let answered = 0;
  for (const r of rows) {
    const a = r.answers[q.id];
    if (a == null || a === '') continue;
    answered++;
    for (const v of Array.isArray(a) ? a : [a]) { const l = optionLabel(q, v); counts.set(l, (counts.get(l) ?? 0) + 1); }
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count, pct: answered ? Math.round((count / answered) * 1000) / 10 : 0 }));
}

export function numericStats(q: FormQuestion, rows: ResponseRow[]) {
  const nums = rows.map((r) => r.answers[q.id]).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  if (!nums.length) return null;
  const sum = nums.reduce((s, v) => s + v, 0);
  const mid = nums.length >> 1;
  const dist = new Map<number, number>(); nums.forEach((v) => dist.set(v, (dist.get(v) ?? 0) + 1));
  return { n: nums.length, min: nums[0], max: nums[nums.length - 1], mean: Math.round((sum / nums.length) * 100) / 100, median: nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2, dist: [...dist.entries()].sort((a, b) => a[0] - b[0]) };
}

/** Net Promoter Score: promoters 9-10, passives 7-8, detractors 0-6; NPS = % promoters - % detractors (from -100 to +100). */
export function npsOf(q: FormQuestion, rows: ResponseRow[]) {
  const s = rows.map((r) => r.answers[q.id]).filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 10);
  if (!s.length) return null;
  const p = s.filter((v) => v >= 9).length, d = s.filter((v) => v <= 6).length, n = s.length;
  return { n, promoters: p, passives: n - p - d, detractors: d, nps: Math.round(((p - d) / n) * 100) };
}

export function perDay(rows: ResponseRow[], days: number, now = new Date()): Array<{ day: string; count: number }> {
  const out = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); out.set(d.toISOString().slice(0, 10), 0); }
  for (const r of rows) { const k = r.created_at.slice(0, 10); if (out.has(k)) out.set(k, (out.get(k) ?? 0) + 1); }
  return [...out.entries()].map(([day, count]) => ({ day, count }));
}

export function wordFrequency(texts: string[], top = 12): Array<{ word: string; count: number }> {
  const stop = new Set('the a an and or but of to in on at for with is are was were be been it this that i you we they my your our not no so as by from have has had do does did can will just very'.split(' '));
  const m = new Map<string, number>();
  for (const t of texts) for (const w of t.toLowerCase().match(/[a-zÀ-ɏऀ-ॿ']{3,}/g) ?? []) if (!stop.has(w)) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([word, count]) => ({ word, count }));
}

// ---------------------------------------------------------------- export
/** A spreadsheet runs a cell that starts with = + - @ as a formula: those cells get a quote in front. */
export const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? "'" + v : v);
const csvEscape = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
export function answerText(q: FormQuestion, a: unknown): string {
  if (a == null || a === '') return '';
  if (q.type === 'consent') return a === true ? 'Yes' : '';
  if (Array.isArray(a)) return a.map((v) => optionLabel(q, v)).join('; ');
  if (hasOptions(q.type)) return optionLabel(q, a);
  return String(a);
}
export function toCsv(qs: FormQuestion[], rows: ResponseRow[]): string {
  const cols = qs.filter((q) => isAnswerable(q.type));
  const head = ['Response ID', 'Submitted at', ...cols.map((q) => q.title)];
  const lines = [head.map((h) => csvEscape(safeCell(h))).join(',')];
  for (const r of rows) lines.push([r.id, r.created_at, ...cols.map((q) => answerText(q, r.answers[q.id]))].map((c) => csvEscape(safeCell(String(c)))).join(','));
  return '﻿' + lines.join('\r\n');
}
export function toJson(title: string, qs: FormQuestion[], rows: ResponseRow[]): string {
  const cols = qs.filter((q) => isAnswerable(q.type));
  return JSON.stringify({ form: title, exportedAt: new Date().toISOString(), responses: rows.map((r) => ({ id: r.id, submittedAt: r.created_at, answers: Object.fromEntries(cols.map((q) => [q.title, answerText(q, r.answers[q.id])])) })) }, null, 2);
}

/** What stops a form from being published (the database checks again). */
export function publishProblems(title: string, d: FormDraft): string[] {
  const out: string[] = [];
  if (!title.trim()) out.push('The form needs a title');
  const real = d.questions.filter((q) => isAnswerable(q.type));
  if (!real.length) out.push('Add at least one question');
  for (const q of d.questions) {
    if (isAnswerable(q.type) && !q.title.trim()) out.push('A question has no title');
    if (hasOptions(q.type) && !(q.options?.length)) out.push(`"${q.title}" needs at least one option`);
  }
  return [...out, ...logicProblems(d.questions)];
}
