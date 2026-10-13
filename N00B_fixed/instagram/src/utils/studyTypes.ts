// NOOB STUDY: the shapes the server sends and the app uses.

export interface StudyGoals { mainGoals?: string[]; career?: string; exam?: string; targets?: string; difficultTopics?: string; strongSubjects?: string; beyondSyllabus?: string; skills?: string; biggestProblem?: string }
export interface StudyHabits { studyTimes?: string; dailyMinutes?: number; daysPerWeek?: number; sessionMinutes?: number; partOfDay?: string[]; learningStyles?: string[]; commitments?: string; examNote?: string }
export interface TutorPrefs { name?: string; language?: string; style?: string; length?: 'short' | 'detailed'; level?: 'beginner' | 'advanced'; examples?: 'real' | 'formal'; mode?: 'text' | 'voice' | 'mixed'; accessibility?: string; reminders?: string; voice?: string; teachMode?: boolean }
export interface StudyPrivacy { recommendations?: boolean; trackActivity?: boolean; useHistory?: boolean }

export interface StudyProfile {
  displayName: string; country: string; language: string; timezone: string; level: string | null;
  institution: string; board: string; classYear: string; stream: string; course: string; specialization: string;
  goals: StudyGoals; habits: StudyHabits; tutor: TutorPrefs; privacy: StudyPrivacy;
  onboardingStep: number; onboardingDone: boolean;
}
export interface StudySubject { id: string; name: string; kind: 'catalogue' | 'custom'; position: number }
export interface StudyMe { profile: StudyProfile | null; subjects: StudySubject[] }

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskKind = 'task' | 'homework' | 'revision' | 'practice' | 'exam_prep';
export type Priority = 'low' | 'normal' | 'high';
export interface StudyTask {
  id: string; subjectId: string | null; title: string; description: string; kind: TaskKind; dueAt: string | null; priority: Priority;
  estMinutes: number | null; status: TaskStatus; completedAt: string | null; attachment: string | null; createdAt: string; updatedAt: string;
}
export interface StudyExam { id: string; subjectId: string | null; title: string; examAt: string; notes: string }

export type SessionActivity = 'study' | 'revise' | 'practice' | 'homework' | 'review_mistakes' | 'read' | 'flashcards';
export interface StudySession {
  id: string; subjectId: string | null; topic: string; startsAt: string; durationMin: number; objective: string; activity: SessionActivity;
  priority: Priority; status: 'planned' | 'done' | 'skipped'; source: 'manual' | 'ai'; why: string;
}

export interface DashSubject { id: string; name: string; kind: string; pendingTasks: number; minutes7: number; lastActivity: string | null; nextSession: { topic: string; startsAt: string } | null }
export interface StudyDashboard {
  today: string; timezone: string;
  tasksToday: StudyTask[]; overdue: StudyTask[]; upcoming: StudyTask[]; sessionsToday: StudySession[]; exams: StudyExam[];
  week: { date: string; minutes: number }[]; subjects: DashSubject[];
  stats: { activeDays7: number; minutes7: number; tasksDone7: number; streak: number };
}

export interface StudyConversation { id: string; title: string; subjectId: string | null; mode: 'chat' | 'teach' | 'photo' | 'voice' | 'document'; topic: string; materialId: string | null; createdAt: string; lastMessageAt: string; preview: string }
export interface StudyMessage { id: string; role: 'user' | 'assistant'; content: string; attachments: Array<{ key: string; kind: 'image' }>; meta: Record<string, unknown>; createdAt: string }

export type MaterialKind = 'notes' | 'pdf' | 'text' | 'image' | 'pyq' | 'research';
export interface StudyMaterial { id: string; title: string; kind: MaterialKind; subjectId: string | null; sourceName: string; pages: number | null; charCount: number; chunkCount: number; status: 'processing' | 'ready' | 'failed'; note: string; createdAt: string }
export interface MaterialHit { materialId: string; title: string; page: number | null; idx: number; rank: number; snippet: string }
export interface MaterialChunk { idx: number; page: number | null; text: string }

// ---- practice
export type QuestionType = 'mcq' | 'tf' | 'short' | 'numerical' | 'fill' | 'case';
export interface QuizQuestion { type: QuestionType; question: string; options?: string[]; answer: number | string | boolean; explanation: string; unit?: string; steps?: string[]; marks?: number }
export interface StudyQuiz { id: string; title: string; topic: string; subjectId: string | null; materialId: string | null; difficulty: 'easy' | 'medium' | 'hard' | 'mixed'; source: 'ai' | 'mistakes' | 'manual'; count: number; createdAt: string; attempts: number; best: number | null; lastAt: string | null; questions?: QuizQuestion[] }
export interface QuizResultItem { i: number; correct: boolean | null; score: number; max: number; open: boolean; answered: boolean }
export interface QuizAttemptResult { id: string; score: number; max: number; percent: number; results: QuizResultItem[]; newMistakes?: number; duplicate?: boolean }
export interface StudyMistake { id: string; subjectId: string | null; question: string; correctAnswer: string; studentAnswer: string; explanation: string; type: QuestionType; wrongCount: number; resolved: boolean; lastWrongAt: string }
export interface StudyDeck { id: string; title: string; subjectId: string | null; materialId: string | null; createdAt: string; total: number; due: number; fresh: number }
export interface StudyCard { id: string; deckId: string; deckTitle: string | null; front: string; back: string; reps: number; lapses: number; intervalDays: number; dueAt: string; fresh: boolean; ease?: number }
export interface StudyTopic { id: string; subjectId: string; title: string; status: 'not_started' | 'learning' | 'confident'; note: string; position: number }
