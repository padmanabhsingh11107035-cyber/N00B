import React, { useEffect, useMemo, useState } from 'react';
import { studyApi } from '../../../services/studyApi';
import type { StudyPrivacy, TutorPrefs } from '../../../utils/studyTypes';
import { LANGUAGES, REMINDER_OPTIONS, TUTOR_STYLES } from '../../../utils/studyCatalog';
import { timeZoneList } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { Btn, Chip, Field, Page, Toggle } from '../ui';
import type { PageProps } from '../StudyApp';

// Quick settings: the tutor, the time zone, reminders and what NOOB STUDY may use. Each change is saved as soon as it is made.
const Settings: React.FC<PageProps> = () => {
  const { me, setMe, toast } = useStudy();
  const p = me?.profile;
  const [tutor, setTutor] = useState<TutorPrefs>(p?.tutor || {});
  const [privacy, setPrivacy] = useState<StudyPrivacy>({ recommendations: true, trackActivity: true, useHistory: true, ...(p?.privacy || {}) });
  const [tz, setTz] = useState(p?.timezone || 'Asia/Kolkata');
  const [language, setLanguage] = useState(p?.language || 'en');
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => { const l = timeZoneList(); return l.includes(tz) ? l : [tz, ...l]; }, [tz]);
  useEffect(() => { if (p) { setTutor(p.tutor || {}); setTz(p.timezone); setLanguage(p.language); } }, [p?.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (patch: Parameters<typeof studyApi.saveProfile>[0]) => {
    setBusy(true);
    const r = await studyApi.saveProfile(patch);
    setBusy(false);
    if (!r.ok) { toast(r.error); return false; }
    setMe(r.data); toast('Saved.');
    return true;
  };
  const changeTutor = (t: Partial<TutorPrefs>) => { const next = { ...tutor, ...t }; setTutor(next); void persist({ tutor: next }); };
  const changePrivacy = (k: keyof StudyPrivacy, v: boolean) => { const next = { ...privacy, [k]: v }; setPrivacy(next); void persist({ privacy: next }); };

  if (!p) return <Page title="Settings"><div className="st-card-flat"><p className="st-small st-muted">Set up your study space first, and settings will appear here.</p><div style={{ marginTop: 10 }}><Btn small kind="primary" onClick={() => goStudy('onboarding')}>Set up</Btn></div></div></Page>;

  return (
    <Page title="Settings">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ display: 'grid', gap: 12 }}>
          <h2 className="st-title st-h2">Your tutor</h2>
          <Field label="Name"><input className="st-input" value={tutor.name || ''} maxLength={30} placeholder="Nova" onChange={(e) => setTutor({ ...tutor, name: e.target.value })} onBlur={() => void persist({ tutor })} /></Field>
          <Field label="Explains in"><select className="st-input" value={tutor.language || language} onChange={(e) => changeTutor({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.native})</option>)}</select></Field>
          <Field label="Manner"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{TUTOR_STYLES.map((t) => <Chip key={t.id} on={tutor.style === t.id} onClick={() => changeTutor({ style: t.id })}>{t.label}</Chip>)}</div></Field>
          <Field label="Answers"><div style={{ display: 'flex', gap: 8 }}><Chip on={tutor.length === 'short'} onClick={() => changeTutor({ length: 'short' })}>Short</Chip><Chip on={tutor.length !== 'short'} onClick={() => changeTutor({ length: 'detailed' })}>Detailed</Chip></div></Field>
          <Field label="Level"><div style={{ display: 'flex', gap: 8 }}><Chip on={tutor.level !== 'advanced'} onClick={() => changeTutor({ level: 'beginner' })}>Beginner friendly</Chip><Chip on={tutor.level === 'advanced'} onClick={() => changeTutor({ level: 'advanced' })}>Advanced</Chip></div></Field>
          <Field label="Examples"><div style={{ display: 'flex', gap: 8 }}><Chip on={tutor.examples !== 'formal'} onClick={() => changeTutor({ examples: 'real' })}>Real life</Chip><Chip on={tutor.examples === 'formal'} onClick={() => changeTutor({ examples: 'formal' })}>More formal</Chip></div></Field>
          <Toggle on={!!tutor.teachMode} onChange={(v) => changeTutor({ teachMode: v })} label="Teach me, do not just tell me" hint="The tutor asks you a question or gives a hint first. You can always ask for the full answer." />
        </section>
        <section style={{ display: 'grid', gap: 12 }}>
          <h2 className="st-title st-h2">Reminders</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{REMINDER_OPTIONS.map((r) => <Chip key={r.id} on={tutor.reminders === r.id} onClick={() => changeTutor({ reminders: r.id })}>{r.label}</Chip>)}</div>
          <p className="st-tiny st-faint">Reminders show inside NOOB. They only ever tell you about things you planned yourself.</p>
        </section>
        <section style={{ display: 'grid', gap: 12 }}>
          <h2 className="st-title st-h2">Language and time</h2>
          <Field label="Your learning language"><select className="st-input" value={language} onChange={(e) => { setLanguage(e.target.value); void persist({ language: e.target.value }); }}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.native})</option>)}</select></Field>
          <Field label="Time zone"><select className="st-input" value={tz} onChange={(e) => { setTz(e.target.value); void persist({ timezone: e.target.value }); }}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
        </section>
        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">What NOOB STUDY may use</h2>
          <Toggle on={privacy.recommendations !== false} onChange={(v) => changePrivacy('recommendations', v)} label="Suggestions from my activity" hint="For example, a hint that you have not revised a topic for a while." />
          <Toggle on={privacy.trackActivity !== false} onChange={(v) => changePrivacy('trackActivity', v)} label="Remember what I study" hint="Study time and finished tasks. If off, your week and progress stay empty." />
          <Toggle on={privacy.useHistory !== false} onChange={(v) => changePrivacy('useHistory', v)} label="Let the tutor remember earlier chats" hint="If off, every conversation starts fresh." />
          <Btn kind="ghost" onClick={() => goStudy('privacy')}>Privacy and your data</Btn>
        </section>
        {busy && <p className="st-tiny st-faint" aria-live="polite">Saving…</p>}
      </div>
    </Page>
  );
};
export default Settings;
