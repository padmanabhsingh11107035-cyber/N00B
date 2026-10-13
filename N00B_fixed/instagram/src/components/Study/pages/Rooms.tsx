import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Users } from 'lucide-react';
import { studyApi, type RoomSummary } from '../../../services/studyApi';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Card, Empty, ErrorBox, Field, Loading, Page, Sheet } from '../ui';

// Study rooms: a small private group (up to 8 friends) with a goal and an invite code. Nothing about you is shared unless you switch it on, inside the room.
const Rooms: React.FC<PageProps> = () => {
  const { toast } = useStudy();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const r = await studyApi.rooms();
    if (r.ok) { setRooms(r.data.rooms); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const join = async () => {
    if (joining) return;
    setJoining(true); setJoinError(null);
    const r = await studyApi.roomJoin(code);
    setJoining(false);
    if (!r.ok) { setJoinError(r.error); return; }
    if (!r.data.success || !r.data.id) { setJoinError(r.data.error || 'That did not work. Please check the code.'); return; }
    toast(r.data.already ? 'You are already in ' + r.data.name + '.' : 'You joined ' + r.data.name + '.');
    setCode('');
    goStudy('room', { id: r.data.id });
  };

  return (
    <Page title="Study rooms" subtitle="Study with friends">
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="st-notice"><p className="st-small">A room is a small private group of up to 8 friends. There is no chatting, only kind cheers. Your study time and “I am focusing” show to the room only if you switch them on, and you can switch them off again at any time.</p></div>

        <Card>
          <p className="st-title st-h3">Join with a code</p>
          <p className="st-small st-muted" style={{ marginTop: 2 }}>Your friend who made the room can see its 6-letter code.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="st-input" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setJoinError(null); }} placeholder="ABC123" maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Room code" style={{ letterSpacing: '0.2em', fontWeight: 800, textAlign: 'center' }} onKeyDown={(e) => { if (e.key === 'Enter') void join(); }} />
            <Btn kind="primary" busy={joining} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6} onClick={() => void join()}><KeyRound size={16} /> Join</Btn>
          </div>
          {joinError && <p className="st-small" role="alert" style={{ marginTop: 8, color: 'var(--st-warn)' }}>{joinError}</p>}
        </Card>

        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!rooms && !error && <Loading rows={2} />}
        {rooms && rooms.length === 0 && <Empty icon={<Users size={26} />} title="No rooms yet" text="Make a room and share its code with a friend, or join one with a code." action={<Btn kind="primary" onClick={() => setCreating(true)}><Plus size={16} /> Make a room</Btn>} />}
        {rooms && rooms.length > 0 && (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {rooms.map((r) => (
                <button key={r.id} className="st-row-btn" onClick={() => goStudy('room', { id: r.id })}>
                  <span style={{ color: 'var(--st-accent)' }}><Users size={20} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="st-title st-h3" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    <span className="st-tiny st-muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.members} {r.members === 1 ? 'person' : 'people'}{r.topic ? ' · ' + r.topic : ''}{r.role === 'owner' ? ' · you made it' : ''}</span>
                  </span>
                </button>
              ))}
            </div>
            <Btn onClick={() => setCreating(true)}><Plus size={16} /> Make a room</Btn>
          </>
        )}
      </div>
      {creating && <RoomForm title="Make a room" onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); goStudy('room', { id }); }} />}
    </Page>
  );
};
export default Rooms;

// the same form makes a room and edits one
export const RoomForm: React.FC<{ title: string; onClose: () => void; onDone: (id: string) => void; edit?: { id: string; name: string; topic: string; goal: string; goalMinutes: number | null } }> = ({ title, onClose, onDone, edit }) => {
  const { toast } = useStudy();
  const [name, setName] = useState(edit?.name || '');
  const [topic, setTopic] = useState(edit?.topic || '');
  const [goal, setGoal] = useState(edit?.goal || '');
  const [hours, setHours] = useState(edit?.goalMinutes ? String(Math.round((edit.goalMinutes / 60) * 10) / 10) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    const h = hours.trim() === '' ? null : Number(hours.replace(',', '.'));
    if (h !== null && (!Number.isFinite(h) || h < 0.5 || h > 100)) { setErr('A weekly goal can be from half an hour to 100 hours.'); return; }
    const minutes = h === null ? null : Math.round(h * 60);
    setBusy(true); setErr(null);
    const r = edit ? await studyApi.roomUpdate(edit.id, name, topic, goal, minutes) : await studyApi.roomCreate(name, topic, goal, minutes);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    toast(edit ? 'Room updated.' : 'Your room is ready.');
    onDone(r.data.id);
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Room name"><input className="st-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Class 10 maths gang" autoFocus /></Field>
        <Field label="What are you studying? (optional)"><input className="st-input" value={topic} maxLength={100} onChange={(e) => setTopic(e.target.value)} placeholder="Trigonometry" /></Field>
        <Field label="Your goal together (optional)"><input className="st-input" value={goal} maxLength={200} onChange={(e) => setGoal(e.target.value)} placeholder="Finish the chapter before Friday" /></Field>
        <Field label="Weekly study goal in hours (optional)" hint="Counts only the minutes that members choose to share."><input className="st-input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="10" /></Field>
        {err && <p className="st-small" role="alert" style={{ color: 'var(--st-warn)' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10 }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" style={{ flex: 1 }} busy={busy} disabled={!name.trim()} onClick={() => void save()}>{edit ? 'Save' : 'Make the room'}</Btn></div>
      </div>
    </Sheet>
  );
};
