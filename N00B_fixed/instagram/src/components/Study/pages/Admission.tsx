import React, { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { studyApi, type AdmissionForm } from '../../../services/studyApi';
import { boardsFor, classYearOptions, COUNTRIES, LEVELS, isSchoolLevel } from '../../../utils/studyCatalog';
import { useStudy } from '../StudyContext';
import { backStudy, leaveStudy, replaceStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Card, Chip, Field, Page } from '../ui';

// The admission form. Short, kind, and honest about who can see what. It is shown once, to a new student, before anything else; an admitted student can open it
// again from their profile to change their details. The administrator sees what is written here (and the student's marks and study time), never their chats.
const HEARD = ['A friend', 'School or teacher', 'Social media', 'NOOB app', 'Other'];
const Admission: React.FC<PageProps> = ({ params }) => {
  const { me, user, gate, reload, toast } = useStudy();
  const editing = !!gate?.admission;
  const a = gate?.admission;
  const p = me?.profile;
  const [form, setForm] = useState<AdmissionForm>({
    fullName: a?.fullName || p?.displayName || user.displayName || '', level: a?.level || p?.level || '', classYear: a?.classYear || p?.classYear || '', board: a?.board || p?.board || '',
    institution: a?.institution || p?.institution || '', city: a?.city || '', state: a?.state || '', country: a?.country || p?.country || 'India', birthYear: a?.birthYear ?? null,
    phone: a?.phone || '', guardianName: a?.guardianName || '', guardianPhone: a?.guardianPhone || '', goal: a?.goal || '', heardFrom: a?.heardFrom || '', consent: editing
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (patch: AdmissionForm) => setForm((f) => ({ ...f, ...patch }));
  const closed = !editing && gate && !gate.admissionsOpen;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 50 }, (_, i) => thisYear - 4 - i);
  const school = isSchoolLevel(form.level || '');

  const submit = async () => {
    if (busy) return;
    if ((form.fullName || '').trim().length < 2) { setError('Please write your full name.'); return; }
    if (!form.level) { setError('Please choose your class or level.'); return; }
    if (!editing && !form.consent) { setError('Please tick the box to say you agree, to continue.'); return; }
    setBusy(true); setError(null);
    const r = await studyApi.saveAdmission({ ...form, birthYear: form.birthYear || null });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    await reload();
    if (editing) { toast('Saved.'); backStudy(); } else setDone(r.data.admissionNo);
  };

  if (done) {
    return (
      <div className="st-scroll"><div className="st-wrap" style={{ textAlign: 'center', paddingTop: 40 }}>
        <img src="/noob-study-logo.svg" alt="" width={112} height={112} style={{ margin: '0 auto' }} />
        <p className="st-eyebrow" style={{ marginTop: 18 }}>Welcome to NOOB STUDY</p>
        <h1 className="st-title st-h1" style={{ fontSize: 28, marginTop: 6 }}>You are admitted</h1>
        <Card tint style={{ marginTop: 18 }}>
          <p className="st-small st-muted">Your admission number</p>
          <p className="st-title" style={{ fontSize: 30, letterSpacing: 1, marginTop: 4 }}>{done}</p>
          <p className="st-small st-muted" style={{ marginTop: 6 }}>Keep it safe: you can show it to NOOB support.</p>
        </Card>
        <div style={{ marginTop: 22 }}><Btn kind="primary" block onClick={() => replaceStudy('home')}>Let us begin</Btn></div>
      </div></div>
    );
  }

  return (
    <Page title={editing ? 'My admission' : 'Admission form'} subtitle={editing ? 'Change your details' : 'Join NOOB STUDY'} hideBack={!editing}>
      <div style={{ display: 'grid', gap: 16 }}>
        {!editing && (
          <div className="st-in" style={{ textAlign: 'center' }}>
            <img src="/noob-study-logo.svg" alt="" width={96} height={96} style={{ margin: '0 auto' }} />
            <h1 className="st-title st-h1" style={{ fontSize: 26, marginTop: 10 }}>Welcome. Let us admit you.</h1>
            <p className="st-muted" style={{ marginTop: 6 }}>It takes a minute. Only the first two things are needed.</p>
          </div>
        )}
        {closed && <div className="st-notice st-notice-warn" role="alert">Admissions are closed for now. Please check back soon.</div>}
        <Field label="Your full name"><input className="st-input" value={form.fullName || ''} maxLength={80} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" /></Field>
        <Field label="Your class or level">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{LEVELS.map((l) => <Chip key={l.id} on={form.level === l.id} onClick={() => set({ level: l.id, board: '', classYear: '' })}>{l.label}</Chip>)}</div>
        </Field>
        {form.level && classYearOptions(form.level).length > 0 && (
          <Field label="Which class or year?"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{classYearOptions(form.level).map((c) => <Chip key={c.id} on={form.classYear === c.id} onClick={() => set({ classYear: c.id })}>{c.label}</Chip>)}</div></Field>
        )}
        {school && boardsFor(form.level).length > 0 && (
          <Field label="Your board"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{boardsFor(form.level).map((b) => <Chip key={b.id} on={form.board === b.id} onClick={() => set({ board: b.id })}>{b.label}</Chip>)}</div></Field>
        )}
        <Field label="School or college (optional)"><input className="st-input" value={form.institution || ''} maxLength={120} onChange={(e) => set({ institution: e.target.value })} /></Field>
        <div className="st-grid2">
          <Field label="City (optional)"><input className="st-input" value={form.city || ''} maxLength={80} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" /></Field>
          <Field label="State (optional)"><input className="st-input" value={form.state || ''} maxLength={80} onChange={(e) => set({ state: e.target.value })} autoComplete="address-level1" /></Field>
        </div>
        <Field label="Country"><select className="st-input" value={form.country || ''} onChange={(e) => set({ country: e.target.value })}>{COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Year of birth (optional)"><select className="st-input" value={form.birthYear || ''} onChange={(e) => set({ birthYear: e.target.value ? Number(e.target.value) : null })}><option value="">Prefer not to say</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></Field>
        <Field label="Your phone (optional)" hint="Only NOOB's team can see it, to help you if you need it."><input className="st-input" type="tel" inputMode="tel" value={form.phone || ''} maxLength={24} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" /></Field>
        {school && (
          <div className="st-grid2">
            <Field label="Parent or guardian (optional)"><input className="st-input" value={form.guardianName || ''} maxLength={80} onChange={(e) => set({ guardianName: e.target.value })} /></Field>
            <Field label="Their phone (optional)"><input className="st-input" type="tel" inputMode="tel" value={form.guardianPhone || ''} maxLength={24} onChange={(e) => set({ guardianPhone: e.target.value })} /></Field>
          </div>
        )}
        <Field label="What do you want to achieve? (optional)"><input className="st-input" value={form.goal || ''} maxLength={200} onChange={(e) => set({ goal: e.target.value })} placeholder="e.g. Score well in the board exams" /></Field>
        <Field label="How did you hear about us? (optional)"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{HEARD.map((h) => <Chip key={h} on={form.heardFrom === h} onClick={() => set({ heardFrom: form.heardFrom === h ? '' : h })}>{h}</Chip>)}</div></Field>

        <Card>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={18} style={{ color: 'var(--st-accent)' }} /> Who can see what</p>
          <ul className="st-small st-muted" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>NOOB's administrators can see this form, your study time, your tasks and exams, and your quiz and weekly test marks.</li>
            <li>They can never see your chats with the AI tutor, the pictures you send it, your notes or your sketches.</li>
            <li>Other students never see any of it. You can delete your data any time from Privacy.</li>
          </ul>
        </Card>
        {!editing && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.consent} onChange={(e) => set({ consent: e.target.checked })} style={{ width: 20, height: 20, marginTop: 2, accentColor: 'var(--st-accent)', flex: 'none' }} />
            <span className="st-small">I have read this, and I agree to join NOOB STUDY. If I am under 18, my parent or guardian knows.</span>
          </label>
        )}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} disabled={!!closed} onClick={() => void submit()}><BadgeCheck size={18} /> {editing ? 'Save my details' : 'Admit me'}</Btn>
        {!editing && <Btn kind="ghost" onClick={leaveStudy}>Not now</Btn>}
        {params.edit === true && null}
      </div>
    </Page>
  );
};
export default Admission;
