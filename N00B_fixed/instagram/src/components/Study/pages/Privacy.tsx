import React, { useState } from 'react';
import { Eye, ShieldCheck, Trash2 } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { useStudy } from '../StudyContext';
import { closeStudy } from '../studyStore';
import { Btn, Card, Field, Page, Sheet } from '../ui';
import type { PageProps } from '../StudyApp';

// Plain words about what is saved, and real ways to delete it. Nothing here touches the student's NOOB account.
const Privacy: React.FC<PageProps> = () => {
  const { reload, toast } = useStudy();
  const [ask, setAsk] = useState<'activity' | 'conversations' | 'all' | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!ask || busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.deleteMyData(ask);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(ask === 'all' ? 'Everything in NOOB STUDY was deleted.' : ask === 'conversations' ? 'Your tutor chats were deleted.' : 'Your activity history was deleted.');
    setAsk(null); setTyped('');
    await reload();
    if (ask === 'all') closeStudy();
  };

  return (
    <Page title="Privacy and your data">
      <div style={{ display: 'grid', gap: 14 }}>
        <Card tint>
          <div style={{ display: 'flex', gap: 12 }}>
            <ShieldCheck size={24} style={{ color: 'var(--st-accent)', flex: 'none' }} />
            <div><p className="st-title st-h3">You are in charge</p><p className="st-small st-muted" style={{ marginTop: 4 }}>Only you can see your study space. Other students, friends and classmates never see your marks, notes, chats or plans. Friends see only what you choose to share in a study room.</p></div>
          </div>
        </Card>
        <Card>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Eye size={17} /> What is saved</p>
          <ul className="st-small st-muted" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Your answers in the set-up form (level, subjects, goals, routine, tutor choices).</li>
            <li>Your tasks, exams and timetable.</li>
            <li>When you finish a focus session, a task or a study session (only the time and the subject).</li>
            <li>Your tutor chats, notes and practice results, when you use those parts.</li>
          </ul>
          <p className="st-small st-muted" style={{ marginTop: 10 }}>Not saved: clicks, typing, your camera or microphone (they are used only while you tap them), or anything about other apps on your phone.</p>
        </Card>
        <Card>
          <p className="st-title st-h3">Delete your data</p>
          <p className="st-small st-muted" style={{ marginTop: 4 }}>Your NOOB account, posts and chats are never touched by these.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <Btn onClick={() => setAsk('activity')}><Trash2 size={16} /> Delete my activity history</Btn>
            <Btn onClick={() => setAsk('conversations')}><Trash2 size={16} /> Delete my tutor chats and pictures</Btn>
            <Btn kind="warn" onClick={() => setAsk('all')}><Trash2 size={16} /> Delete everything in NOOB STUDY</Btn>
          </div>
        </Card>
      </div>
      {ask && (
        <Sheet title={ask === 'all' ? 'Delete everything?' : ask === 'conversations' ? 'Delete all your tutor chats?' : 'Delete your activity history?'} onClose={() => { setAsk(null); setTyped(''); }}>
          <p className="st-small st-muted">{ask === 'all'
            ? 'Your profile, subjects, tasks, exams, timetable, focus history, chats, notes and practice records in NOOB STUDY will be erased for good. You can set up again any time.'
            : ask === 'conversations'
              ? 'Every chat with your tutor, and the pictures you sent in them, will be erased for good. Your tasks, subjects and profile stay.'
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
