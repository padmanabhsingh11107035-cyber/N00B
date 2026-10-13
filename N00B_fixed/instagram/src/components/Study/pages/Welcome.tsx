import React from 'react';
import { BookOpenCheck, CalendarHeart, MessagesSquare, Sparkles, X } from 'lucide-react';
import { useStudy } from '../StudyContext';
import { leaveStudy, goStudy, replaceStudy } from '../studyStore';
import { Btn, Orb } from '../ui';
import type { PageProps } from '../StudyApp';

// The first thing a new student sees: friendly, short, no pressure. Setting up takes about two minutes and can be left half-done and resumed.
const Welcome: React.FC<PageProps> = () => {
  const { me, user, skipSetup } = useStudy();
  const started = (me?.profile?.onboardingStep || 0) > 0 && !me?.profile?.onboardingDone;
  const name = (me?.profile?.displayName || user.displayName || '').split(' ')[0];
  return (
    <div className="st-scroll">
      <div className="st-wrap" style={{ paddingTop: 'max(22px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="st-icon-btn" onClick={leaveStudy} aria-label="Back to NOOB"><X size={18} /></button>
        </div>
        <div className="st-in" style={{ textAlign: 'center', marginTop: 6 }}>
          <Orb size={92} float />
          <p className="st-eyebrow" style={{ marginTop: 22 }}>NOOB STUDY</p>
          <h1 className="st-title st-h1" style={{ fontSize: 31, marginTop: 6 }}>{name ? `Hi ${name}, welcome to your calm study space` : 'Welcome to your calm study space'}</h1>
          <p className="st-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>A friendly AI tutor, a plan that fits your real life, and a place to practise at your own pace. No pressure. Every small step counts.</p>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
          {[
            { icon: <MessagesSquare size={20} />, title: 'Understand anything', text: 'Ask in your own language, by typing, talking or sending a photo.' },
            { icon: <CalendarHeart size={20} />, title: 'Plan without stress', text: 'A timetable built around the time you really have.' },
            { icon: <BookOpenCheck size={20} />, title: 'Practise your way', text: 'Short quizzes and flashcards that come back at the right time.' }
          ].map((x, i) => (
            <div key={x.title} className="st-card-flat st-in" style={{ display: 'flex', gap: 12, alignItems: 'center', animationDelay: `${120 + i * 90}ms` }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--st-accent-soft)', color: 'var(--st-accent)', flex: 'none' }}>{x.icon}</span>
              <div><p className="st-title st-h3">{x.title}</p><p className="st-small st-muted">{x.text}</p></div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
          <Btn kind="primary" block onClick={() => goStudy('onboarding')}><Sparkles size={18} /> {started ? 'Continue where I left off' : 'Set up in 2 minutes'}</Btn>
          <Btn kind="ghost" block onClick={() => { skipSetup(); replaceStudy('home'); }}>Look around first</Btn>
          <p className="st-tiny st-faint" style={{ textAlign: 'center' }}>You only share what you choose. You can change or delete everything later.</p>
        </div>
      </div>
    </div>
  );
};
export default Welcome;
