import React, { useState } from 'react';
import { Eye, ShieldCheck, Trash2 } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { useStudy } from '../StudyContext';
import { leaveStudy } from '../studyStore';
import { Btn, Card, Field, Page, Sheet } from '../ui';
import type { PageProps } from '../StudyApp';

// Plain words about what is saved, and real ways to delete it. Nothing here touches the student's NOOB account.
const Privacy: React.FC<PageProps> = () => {
  const { reload, toast } = useStudy();
  const [ask, setAsk] = useState<'activity' | 'conversations' | 'library' | 'practice' | 'notepad' | 'all' | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!ask || busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.deleteMyData(ask);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(ask === 'all' ? 'Everything in NOOB STUDY was deleted.' : ask === 'conversations' ? 'Your tutor chats were deleted.' : ask === 'library' ? 'Your library was deleted.' : ask === 'practice' ? 'Your quizzes, mistakes, flashcards and test history were deleted.' : ask === 'notepad' ? 'Your notes and sketches were deleted.' : 'Your activity history was deleted.');
    setAsk(null); setTyped('');
    await reload();
    if (ask === 'all') leaveStudy();
  };

  return (
    <Page title="Privacy and your data">
      <div style={{ display: 'grid', gap: 14 }}>
        <Card tint>
          <div style={{ display: 'flex', gap: 12 }}>
            <ShieldCheck size={24} style={{ color: 'var(--st-accent)', flex: 'none' }} />
            <div><p className="st-title st-h3">You are in charge</p><p className="st-small st-muted" style={{ marginTop: 4 }}>Other students, friends and classmates never see your marks, notes, chats or plans. Friends see only what you choose to share in a study room. The administrator of NOOB STUDY can see your admission form, your marks and how long you study, to help students and keep the space safe. The administrator can never read your chats with the tutor, your pictures, your notes or your sketches.</p></div>
          </div>
        </Card>
        <Card>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Eye size={17} /> What is saved</p>
          <ul className="st-small st-muted" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Your admission form and your answers in the set-up form (level, subjects, goals, routine, tutor choices).</li>
            <li>Your tasks, exams and timetable.</li>
            <li>When you finish a focus session, a task or a study session (only the time and the subject).</li>
            <li>Your tutor chats as text only, the text of documents you add to your library (never the files), and practice results, when you use those parts.</li>
            <li>For each weekly test, only its name, the subject, your marks and when you took it. The questions and your answers are removed when you hand in.</li>
            <li>Your notes and sketches, private to you.</li>
          </ul>
          <p className="st-small st-muted" style={{ marginTop: 10 }}>Not saved: the pictures and videos you send to the tutor (they go straight to the AI with your question and no copy is kept), clicks, typing, your camera or microphone (used only while you tap them), or anything about other apps on your phone.</p>
        </Card>
        <Card>
          <p className="st-title st-h3">Delete your data</p>
          <p className="st-small st-muted" style={{ marginTop: 4 }}>Your NOOB account, posts and chats are never touched by these.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <Btn onClick={() => setAsk('activity')}><Trash2 size={16} /> Delete my activity history</Btn>
            <Btn onClick={() => setAsk('conversations')}><Trash2 size={16} /> Delete my tutor chats</Btn>
            <Btn onClick={() => setAsk('library')}><Trash2 size={16} /> Delete my library documents</Btn>
            <Btn onClick={() => setAsk('notepad')}><Trash2 size={16} /> Delete my notes and sketches</Btn>
            <Btn onClick={() => setAsk('practice')}><Trash2 size={16} /> Delete my quizzes, flashcards and test history</Btn>
            <Btn kind="warn" onClick={() => setAsk('all')}><Trash2 size={16} /> Delete everything in NOOB STUDY</Btn>
          </div>
        </Card>
      </div>
      {ask && (
        <Sheet title={ask === 'all' ? 'Delete everything?' : ask === 'conversations' ? 'Delete all your tutor chats?' : ask === 'library' ? 'Delete your whole library?' : ask === 'practice' ? 'Delete your quizzes, flashcards and test history?' : ask === 'notepad' ? 'Delete your notes and sketches?' : 'Delete your activity history?'} onClose={() => { setAsk(null); setTyped(''); }}>
          <p className="st-small st-muted">{ask === 'all'
            ? 'Your admission, profile, subjects, tasks, exams, timetable, focus history, chats, notes, sketches, test history and practice records in NOOB STUDY will be erased for good. You can fill in the admission form and set up again any time.'
            : ask === 'conversations'
              ? 'Every chat with your tutor will be erased for good. Your tasks, subjects and profile stay.'
              : ask === 'library'
              ? 'Every document in your library, and all its text, will be erased for good. Your chats, tasks, subjects and profile stay.'
              : ask === 'notepad'
              ? 'Every note and every sketch you made will be erased for good. Your chats, tasks, subjects and profile stay.'
              : ask === 'practice'
              ? 'Every saved quiz and its marks, your list of mistakes, all your flashcard decks, and your weekly test history will be erased for good. Your topics, notes, chats and tasks stay.'
              : 'Your focus history and the log of finished work (which feeds your week and progress) will be erased. Your tasks, subjects and profile stay.'}</p>
          {ask === 'all' && <div style={{ marginTop: 12 }}><Field label='Type DELETE to confirm'><input className="st-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" /></Field></div>}
          {error && <div className="st-notice st-notice-warn" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => { setAsk(null); setTyped(''); }}>Keep it</Btn>
            <Btn kind="primary" style={{ flex: 1 }} busy={busy} disabled={ask === 'all' && typed.trim().toUpperCase() !== 'DELETE'} onClick={() => void run()}>Delete</Btn>
          </div>
        </Sheet>
      )}
    </Page>
  );
};
export default Privacy;
