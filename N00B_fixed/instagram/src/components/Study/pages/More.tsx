import React from 'react';
import { BarChart3, BookMarked, BookOpen, FileSearch, CalendarDays, CalendarClock, Camera, FileText, Globe2, Layers, ListChecks, Mic, NotebookPen, Palette, PenTool, Settings2, Sparkles, Target, Timer, Trophy, Users, X, History } from 'lucide-react';
import { leaveStudy, goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Page } from '../ui';

// Every part of NOOB STUDY in one place, grouped, with a plain way back to the main NOOB app. A section appears only when it exists.
const GROUPS: Array<{ title: string; items: Array<{ page: string; label: string; text: string; icon: React.ReactNode }> }> = [
  { title: 'Learn', items: [
    { page: 'tutor', label: 'My AI tutor', text: 'Ask, learn, understand', icon: <Sparkles size={20} /> },
    { page: 'photo', label: 'Photo doubts', text: 'Send a picture of a question', icon: <Camera size={20} /> },
    { page: 'voice', label: 'Talk to your tutor', text: 'Speak and listen', icon: <Mic size={20} /> },
    { page: 'library', label: 'Notes and library', text: 'Your notes and documents', icon: <FileText size={20} /> },
    { page: 'research', label: 'Official sources', text: 'Syllabus, papers, references', icon: <Globe2 size={20} /> },
    { page: 'pyq', label: 'Past papers', text: 'Patterns in papers you added', icon: <FileSearch size={20} /> }
  ] },
  { title: 'Plan', items: [
    { page: 'plan', label: 'My study plan', text: 'Your timetable', icon: <CalendarDays size={20} /> },
    { page: 'tasks', label: 'Homework and tasks', text: 'Add, edit, tick off', icon: <ListChecks size={20} /> },
    { page: 'exams', label: 'Exams', text: 'Countdowns', icon: <CalendarClock size={20} /> },
    { page: 'focus', label: 'Focus timer', text: 'One thing at a time', icon: <Timer size={20} /> }
  ] },
  { title: 'Practise', items: [
    { page: 'practice', label: 'Practice and quizzes', text: 'Questions at your level', icon: <Target size={20} /> },
    { page: 'decks', label: 'Flashcards', text: 'Revise at the right time', icon: <Layers size={20} /> },
    { page: 'mistakes', label: 'My mistakes', text: 'Learn from what went wrong', icon: <BookMarked size={20} /> },
    { page: 'tests', label: 'Weekly tests', text: '10 questions for each subject', icon: <Trophy size={20} /> },
    { page: 'testHistory', label: 'Test history', text: 'Your marks, week by week', icon: <History size={20} /> }
  ] },
  { title: 'Your tools', items: [
    { page: 'notes', label: 'Notepad', text: 'Write things down', icon: <NotebookPen size={20} /> },
    { page: 'sketch', label: 'Sketch board', text: 'Draw it out', icon: <PenTool size={20} /> },
    { page: 'appearance', label: 'Looks and sounds', text: 'Colours, voices, alarm', icon: <Palette size={20} /> }
  ] },
  { title: 'Together and you', items: [
    { page: 'rooms', label: 'Study rooms', text: 'Study with friends', icon: <Users size={20} /> },
    { page: 'progress', label: 'My progress', text: 'What you have done', icon: <BarChart3 size={20} /> },
    { page: 'subjects', label: 'My subjects', text: 'One to six', icon: <BookOpen size={20} /> },
    { page: 'profile', label: 'Profile and settings', text: 'You, your tutor, your data', icon: <Settings2 size={20} /> }
  ] }
];

const More: React.FC<PageProps> = () => (
  <Page title="Everything" subtitle="NOOB STUDY" hideBack>
    <div style={{ display: 'grid', gap: 20 }}>
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => hasRoute(i.page));
        if (!items.length) return null;
        return (
          <section key={g.title} style={{ display: 'grid', gap: 10 }}>
            <p className="st-eyebrow">{g.title}</p>
            <div className="st-grid2 st-grid2-lg">
              {items.map((i) => (
                <button key={i.page} className="st-row-btn" onClick={() => goStudy(i.page)} style={{ alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--st-accent)', marginTop: 2 }}>{i.icon}</span>
                  <span style={{ minWidth: 0 }}><span className="st-title st-h3" style={{ display: 'block' }}>{i.label}</span><span className="st-tiny st-muted">{i.text}</span></span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button className="st-row-btn" onClick={leaveStudy}><span style={{ color: 'var(--st-muted)' }}><X size={20} /></span><span><span className="st-title st-h3" style={{ display: 'block' }}>Back to NOOB</span><span className="st-tiny st-muted">Posts, reels, chats and games</span></span></button>
    </div>
  </Page>
);
export default More;
