// NOOB STUDY: what a student can choose while setting up (education level, board, stream, subjects, languages), and the rules for the choices.
// Pure data and functions, so they can be tested without a browser (scripts/supabase/test-noob-study-ui.mjs). Nothing here pretends to know a
// syllabus: the lists only help a student pick subjects quickly, and anything missing can be typed in as a custom subject.

export const MIN_SUBJECTS = 1;
export const MAX_SUBJECTS = 6;

export interface Option { id: string; label: string; hint?: string }

export const LEVELS: Option[] = [
  { id: 'class_6_8', label: 'Class 6–8', hint: 'Middle school' },
  { id: 'class_9_10', label: 'Class 9–10', hint: 'Secondary' },
  { id: 'class_11', label: 'Class 11', hint: 'Senior secondary' },
  { id: 'class_12', label: 'Class 12', hint: 'Senior secondary' },
  { id: 'diploma', label: 'Diploma', hint: 'Polytechnic or similar' },
  { id: 'undergraduate', label: 'Undergraduate', hint: 'College or university' },
  { id: 'postgraduate', label: 'Postgraduate', hint: 'Masters and beyond' },
  { id: 'other', label: 'Other or self-learning', hint: 'Learning on my own' }
];
export const levelLabel = (id: string | null | undefined): string => LEVELS.find((l) => l.id === id)?.label || '';

// Boards and curricula. India's school boards are listed first because that is who most NOOB students are, but nobody is forced into them.
const SCHOOL_BOARDS: Option[] = [
  { id: 'CBSE', label: 'CBSE' },
  { id: 'ICSE', label: 'ICSE (CISCE)' },
  { id: 'ISC', label: 'ISC (CISCE)' },
  { id: 'GSEB', label: 'Gujarat Board (GSEB)' },
  { id: 'Maharashtra', label: 'Maharashtra State Board' },
  { id: 'UP', label: 'UP Board' },
  { id: 'Rajasthan', label: 'Rajasthan Board' },
  { id: 'MP', label: 'MP Board' },
  { id: 'Karnataka', label: 'Karnataka State Board' },
  { id: 'TamilNadu', label: 'Tamil Nadu State Board' },
  { id: 'Kerala', label: 'Kerala State Board' },
  { id: 'WestBengal', label: 'West Bengal Board' },
  { id: 'Telangana', label: 'Telangana / Andhra Board' },
  { id: 'Punjab', label: 'Punjab Board' },
  { id: 'Bihar', label: 'Bihar Board' },
  { id: 'NIOS', label: 'NIOS' },
  { id: 'IB', label: 'IB (International Baccalaureate)' },
  { id: 'Cambridge', label: 'Cambridge (IGCSE / A-Level)' },
  { id: 'Other', label: 'Other board or curriculum' }
];
// ICSE ends at Class 10 and ISC covers Classes 11–12: the list a student sees follows their class.
export function boardsFor(level: string | null | undefined): Option[] {
  if (level === 'class_6_8' || level === 'class_9_10') return SCHOOL_BOARDS.filter((b) => b.id !== 'ISC');
  if (level === 'class_11' || level === 'class_12') return SCHOOL_BOARDS.filter((b) => b.id !== 'ICSE');
  return [];
}
export const isSchoolLevel = (level: string | null | undefined): boolean => ['class_6_8', 'class_9_10', 'class_11', 'class_12'].includes(String(level));
export const isSeniorLevel = (level: string | null | undefined): boolean => level === 'class_11' || level === 'class_12';
export const isCollegeLevel = (level: string | null | undefined): boolean => ['diploma', 'undergraduate', 'postgraduate'].includes(String(level));

export const STREAMS: Option[] = [
  { id: 'Science', label: 'Science' },
  { id: 'Commerce', label: 'Commerce' },
  { id: 'Humanities', label: 'Humanities / Arts' },
  { id: 'Other', label: 'Vocational or other' }
];

export function classYearOptions(level: string | null | undefined): Option[] {
  switch (level) {
    case 'class_6_8': return ['6', '7', '8'].map((c) => ({ id: c, label: `Class ${c}` }));
    case 'class_9_10': return ['9', '10'].map((c) => ({ id: c, label: `Class ${c}` }));
    case 'class_11': return [{ id: '11', label: 'Class 11' }];
    case 'class_12': return [{ id: '12', label: 'Class 12' }];
    case 'diploma': return ['1', '2', '3'].map((c) => ({ id: c, label: `Year ${c}` }));
    case 'undergraduate': return ['1', '2', '3', '4', '5'].map((c) => ({ id: c, label: `Year ${c}` }));
    case 'postgraduate': return ['1', '2', '3'].map((c) => ({ id: c, label: `Year ${c}` }));
    default: return [];
  }
}

// ---- subjects
export interface SubjectSuggestion { name: string; group?: string }
const s = (names: string[], group?: string): SubjectSuggestion[] => names.map((name) => ({ name, group }));

const MIDDLE = s(['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Sanskrit', 'Gujarati', 'Marathi', 'Computer Science', 'Art', 'Physical Education']);
const SECONDARY = s(['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Information Technology', 'Artificial Intelligence', 'Sanskrit', 'Gujarati', 'Marathi', 'Computer Applications', 'Physical Education']);
const SCIENCE = s(['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science', 'Informatics Practices', 'English', 'Physical Education', 'Psychology', 'Economics', 'Biotechnology', 'Engineering Graphics']);
const COMMERCE = s(['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English', 'Informatics Practices', 'Computer Science', 'Physical Education', 'Entrepreneurship', 'Legal Studies']);
const HUMANITIES = s(['History', 'Political Science', 'Geography', 'Psychology', 'Sociology', 'Economics', 'English', 'Hindi', 'Home Science', 'Legal Studies', 'Physical Education', 'Fine Arts']);
const VOCATIONAL = s(['English', 'Information Technology', 'Retail', 'Automotive', 'Tourism', 'Health Care', 'Financial Markets', 'Physical Education', 'Mathematics']);
const COLLEGE_GENERAL = s(['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Programming', 'Data Structures', 'Economics', 'Accounting', 'Statistics', 'English', 'Communication Skills', 'Electronics', 'Mechanics', 'Management']);
const SELF_LEARNING = s(['Programming', 'English Speaking', 'Mathematics', 'General Knowledge', 'Science', 'Data Science', 'Design', 'Finance', 'A New Language', 'Aptitude and Reasoning']);

// Science combinations (a quick way to pick several at once; every one of them can still be changed one by one)
export interface Combo { id: string; label: string; subjects: string[] }
export const SCIENCE_COMBOS: Combo[] = [
  { id: 'pcm', label: 'PCM', subjects: ['Physics', 'Chemistry', 'Mathematics', 'English'] },
  { id: 'pcb', label: 'PCB', subjects: ['Physics', 'Chemistry', 'Biology', 'English'] },
  { id: 'pcmb', label: 'PCMB', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'] },
  { id: 'pcm_cs', label: 'PCM + Computer Science', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'English'] },
  { id: 'pcm_ip', label: 'PCM + Informatics Practices', subjects: ['Physics', 'Chemistry', 'Mathematics', 'Informatics Practices', 'English'] },
  { id: 'pcb_psy', label: 'PCB + Psychology', subjects: ['Physics', 'Chemistry', 'Biology', 'Psychology', 'English'] }
];
export const COMMERCE_COMBOS: Combo[] = [
  { id: 'com_core', label: 'Accountancy + Business + Economics', subjects: ['Accountancy', 'Business Studies', 'Economics', 'English'] },
  { id: 'com_math', label: 'Commerce with Mathematics', subjects: ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English'] }
];
export function combosFor(level: string | null | undefined, stream: string | null | undefined): Combo[] {
  if (!isSeniorLevel(level)) return [];
  if (stream === 'Science') return SCIENCE_COMBOS;
  if (stream === 'Commerce') return COMMERCE_COMBOS;
  return [];
}

// What to offer for the student's class, stream and course. Never a fixed list for everybody.
export function subjectsFor(level: string | null | undefined, stream?: string | null): SubjectSuggestion[] {
  switch (level) {
    case 'class_6_8': return MIDDLE;
    case 'class_9_10': return SECONDARY;
    case 'class_11':
    case 'class_12':
      return stream === 'Science' ? SCIENCE : stream === 'Commerce' ? COMMERCE : stream === 'Humanities' ? HUMANITIES : stream === 'Other' ? VOCATIONAL
        : [...SCIENCE.slice(0, 4), ...COMMERCE.slice(0, 3), ...HUMANITIES.slice(0, 3)].filter((x, i, a) => a.findIndex((y) => y.name === x.name) === i);
    case 'diploma':
    case 'undergraduate':
    case 'postgraduate': return COLLEGE_GENERAL;
    case 'other': return SELF_LEARNING;
    default: return [];
  }
}

// ---- choosing 1 to 6 subjects (the same rule the database enforces)
export interface ChosenSubject { name: string; kind: 'catalogue' | 'custom' }
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const hasSubject = (list: ChosenSubject[], name: string): boolean => list.some((x) => sameName(x.name, name));

export function toggleSubject(list: ChosenSubject[], name: string, kind: 'catalogue' | 'custom' = 'catalogue'): { list: ChosenSubject[]; error: string | null } {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) return { list, error: null };
  if (clean.length > 60) return { list, error: 'A subject name can be at most 60 characters.' };
  if (hasSubject(list, clean)) return { list: list.filter((x) => !sameName(x.name, clean)), error: null };
  if (list.length >= MAX_SUBJECTS) return { list, error: `You can choose at most ${MAX_SUBJECTS} subjects. Remove one to add another.` };
  return { list: [...list, { name: clean, kind }], error: null };
}
export function subjectsProblem(list: ChosenSubject[]): string | null {
  if (list.length < MIN_SUBJECTS) return `Please choose at least ${MIN_SUBJECTS} subject.`;
  if (list.length > MAX_SUBJECTS) return `You can choose at most ${MAX_SUBJECTS} subjects.`;
  return null;
}
// A combination fills the list (up to the limit); it never silently drops what the student already chose by hand beyond the limit.
export function applyCombo(combo: Combo): ChosenSubject[] {
  return combo.subjects.slice(0, MAX_SUBJECTS).map((name) => ({ name, kind: 'catalogue' as const }));
}

// ---- languages (for the tutor's explanations and for speaking): "hi-latn" is Hinglish (Hindi written in English letters)
export interface Language { code: string; label: string; native: string; speech: string }
export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', native: 'English', speech: 'en-IN' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', speech: 'hi-IN' },
  { code: 'hi-latn', label: 'Hinglish', native: 'Hinglish', speech: 'hi-IN' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', speech: 'gu-IN' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', speech: 'mr-IN' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', speech: 'bn-IN' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', speech: 'ta-IN' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', speech: 'te-IN' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', speech: 'kn-IN' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', speech: 'ml-IN' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', speech: 'pa-IN' },
  { code: 'ur', label: 'Urdu', native: 'اردو', speech: 'ur-IN' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ', speech: 'or-IN' },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া', speech: 'as-IN' },
  { code: 'ne', label: 'Nepali', native: 'नेपाली', speech: 'ne-NP' },
  { code: 'es', label: 'Spanish', native: 'Español', speech: 'es-ES' },
  { code: 'fr', label: 'French', native: 'Français', speech: 'fr-FR' },
  { code: 'de', label: 'German', native: 'Deutsch', speech: 'de-DE' },
  { code: 'pt', label: 'Portuguese', native: 'Português', speech: 'pt-BR' },
  { code: 'ar', label: 'Arabic', native: 'العربية', speech: 'ar-SA' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia', speech: 'id-ID' },
  { code: 'ru', label: 'Russian', native: 'Русский', speech: 'ru-RU' },
  { code: 'ja', label: 'Japanese', native: '日本語', speech: 'ja-JP' },
  { code: 'zh', label: 'Chinese', native: '中文', speech: 'zh-CN' }
];
export const languageLabel = (code: string | null | undefined): string => LANGUAGES.find((l) => l.code === code)?.label || 'English';
export const speechLang = (code: string | null | undefined): string => LANGUAGES.find((l) => l.code === code)?.speech || 'en-IN';
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[a-z]{2,4})?$/;

export const COUNTRIES = ['India', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Pakistan', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Singapore', 'Malaysia', 'United Kingdom', 'United States', 'Canada', 'Australia', 'New Zealand', 'Germany', 'France', 'Other'];

// ---- goals, habits and tutor choices (the labels shown while setting up)
export const GOALS: string[] = [
  'Improve my grades', 'Understand difficult concepts', 'Prepare for board exams', 'Prepare for entrance exams', 'Complete assignments on time',
  'Build a stronger foundation', 'Learn programming', 'Improve spoken English', 'Learn a new language', 'Explore new subjects'
];
export const LEARNING_STYLES: Option[] = [
  { id: 'reading', label: 'Reading' }, { id: 'listening', label: 'Listening' }, { id: 'visual', label: 'Pictures and diagrams' },
  { id: 'examples', label: 'Examples' }, { id: 'practice', label: 'Practice questions' }
];
export const PARTS_OF_DAY: Option[] = [
  { id: 'morning', label: 'Morning' }, { id: 'afternoon', label: 'Afternoon' }, { id: 'evening', label: 'Evening' }, { id: 'night', label: 'Late night' }, { id: 'flexible', label: 'It changes' }
];
export const TUTOR_STYLES: Option[] = [
  { id: 'friendly', label: 'Friendly and warm', hint: 'Like a kind older friend' },
  { id: 'calm', label: 'Calm and patient', hint: 'Slow, gentle, no pressure' },
  { id: 'coach', label: 'Motivating coach', hint: 'Cheers you on' },
  { id: 'direct', label: 'Straight to the point', hint: 'Short and clear' }
];
export const REMINDER_OPTIONS: Option[] = [
  { id: 'off', label: 'No reminders' }, { id: 'gentle', label: 'Gentle (a few a week)' }, { id: 'daily', label: 'Daily nudge' }
];

// ---- the steps of the set-up form
export interface OnboardingStep { id: string; title: string; subtitle: string }
export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'basics', title: 'About you', subtitle: 'Just the basics, nothing private' },
  { id: 'academics', title: 'Your studies', subtitle: 'So explanations match your level' },
  { id: 'subjects', title: 'Your subjects', subtitle: 'Pick 1 to 6' },
  { id: 'goals', title: 'Your goals', subtitle: 'What would make studying feel great?' },
  { id: 'habits', title: 'Your routine', subtitle: 'Plans that fit your real life' },
  { id: 'tutor', title: 'Your AI tutor', subtitle: 'Make it yours' },
  { id: 'review', title: 'All set?', subtitle: 'A last look before we begin' }
];

// What is still missing for a good personal timetable (the form says so plainly instead of guessing).
export function missingForPlan(p: { level?: string | null; habits?: Record<string, unknown> | null }, subjectCount: number): string[] {
  const out: string[] = [];
  if (!p.level) out.push('your education level');
  if (subjectCount < 1) out.push('at least one subject');
  const h = (p.habits || {}) as Record<string, unknown>;
  if (!h.dailyMinutes) out.push('how much time you can study each day');
  if (!h.daysPerWeek) out.push('how many days a week you can study');
  return out;
}
