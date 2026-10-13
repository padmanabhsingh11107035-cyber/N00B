import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Heart, LogOut, Pencil, RefreshCw, Share2, Smile, Sparkles, Trash2, UserMinus, Coffee, Flame } from 'lucide-react';
import { studyApi, type CheerKind, type RoomDetail, type RoomMember } from '../../../services/studyApi';
import { minutesLabel } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { backStudy, replaceStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Card, ErrorBox, Head, Loading, ProgressBar, Sheet, Toggle } from '../ui';
import { RoomForm } from './Rooms';

const CHEERS: Array<{ kind: CheerKind; label: string; said: string; icon: React.ReactNode }> = [
  { kind: 'cheer', label: 'You can do it', said: 'cheered', icon: <Sparkles size={15} /> },
  { kind: 'proud', label: 'So proud of you', said: 'is proud of', icon: <Heart size={15} /> },
  { kind: 'break', label: 'Time for a break?', said: 'suggests a break to', icon: <Coffee size={15} /> },
  { kind: 'start', label: 'Let’s start together', said: 'wants to start with', icon: <Flame size={15} /> }
];
const POLL_MS = 30000;

const Avatar: React.FC<{ m: RoomMember }> = ({ m }) => {
  const [bad, setBad] = useState(false);
  const letter = (m.displayName || m.username || '?').trim().charAt(0).toUpperCase();
  return (
    <span style={{ position: 'relative', width: 40, height: 40, flex: 'none' }}>
      {m.avatar && !bad
        ? <img src={m.avatar} alt="" width={40} height={40} onError={() => setBad(true)} style={{ width: 40, height: 40, borderRadius: 99, objectFit: 'cover', display: 'block' }} />
        : <span style={{ width: 40, height: 40, borderRadius: 99, display: 'grid', placeItems: 'center', fontWeight: 800, background: 'var(--st-accent-soft)', color: 'var(--st-accent)' }}>{letter}</span>}
      {m.studyingNow && <i title="Focusing now" aria-label="Focusing now" style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 99, background: 'var(--st-ok)', border: '2px solid var(--st-bg)' }} />}
    </span>
  );
};

// One room. Another member's minutes and "focusing now" appear only if that member chose to share them, and each person can change that at any time.
const Room: React.FC<PageProps> = ({ params }) => {
  const { toast } = useStudy();
  const id = String(params.id || '');
  const [d, setD] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cheerFor, setCheerFor] = useState<RoomMember | 'all' | null>(null);
  const [sheet, setSheet] = useState<'edit' | 'leave' | 'delete' | { remove: RoomMember } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const r = await studyApi.room(id);
    if (!alive.current) return;
    if (r.ok) { setD(r.data); setError(null); } else setError(r.error);
  }, [id]);
  useEffect(() => {
    alive.current = true;
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => { alive.current = false; window.clearInterval(t); };
  }, [load]);

  const owner = d?.room.role === 'owner';
  const share = async (patch: { minutes?: boolean; status?: boolean }) => {
    if (!d || busy) return;
    setBusy(true);
    const r = await studyApi.roomSettings(id, patch.minutes ?? null, patch.status ?? null);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    void load();
  };
  const sendCheer = async (kind: CheerKind) => {
    const target = cheerFor; if (!target || busy) return;
    setBusy(true);
    const r = await studyApi.roomCheer(id, target === 'all' ? null : target.userId, kind);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setCheerFor(null); toast('Sent. That was kind.'); void load();
  };
  const copyCode = async () => {
    const code = d?.room.code; if (!code) return;
    const text = 'Join my study room on NOOB STUDY. Room code: ' + code;
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ text }); return; }
    } catch (err) { if ((err as Error)?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Copied. Send it to your friend.'); } catch { toast('The code is ' + code + '.'); }
  };
  const newCode = async () => {
    setBusy(true);
    const r = await studyApi.roomNewCode(id);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    toast('New code made. The old one no longer works.'); void load();
  };
  const leave = async () => { setBusy(true); const r = await studyApi.roomLeave(id); setBusy(false); if (!r.ok) { toast(r.error); return; } toast('You left the room.'); replaceStudy('rooms'); };
  const del = async () => { setBusy(true); const r = await studyApi.roomDelete(id); setBusy(false); if (!r.ok) { toast(r.error); return; } toast('Room closed.'); replaceStudy('rooms'); };
  const removeMember = async (m: RoomMember) => { setBusy(true); const r = await studyApi.roomRemoveMember(id, m.userId); setBusy(false); setSheet(null); if (!r.ok) { toast(r.error); return; } toast(m.displayName + ' was removed.'); void load(); };

  if (error && !d) return <><Head title="Study room" onBack={() => replaceStudy('rooms')} /><div className="st-scroll"><div className="st-wrap"><ErrorBox text={error} onRetry={() => void load()} /></div></div></>;
  if (!d) return <><Head title="Study room" onBack={() => replaceStudy('rooms')} /><div className="st-scroll"><div className="st-wrap"><Loading rows={3} /></div></div></>;

  const { room } = d;
  const goalPct = room.goalMinutes ? Math.min(100, Math.round((d.totalMinutes / room.goalMinutes) * 100)) : null;
  return (
    <>
      <Head title={room.name} subtitle={room.memberCount + ' of ' + room.maxMembers + ' people'} onBack={backStudy}
        right={owner ? <button className="st-icon-btn" onClick={() => setSheet('edit')} aria-label="Edit the room"><Pencil size={17} /></button> : undefined} />
      <div className="st-scroll"><div className="st-wrap" style={{ display: 'grid', gap: 14 }}>
        {(room.topic || room.goal) && (
          <Card tint>
            {room.topic && <p className="st-eyebrow">{room.topic}</p>}
            {room.goal && <p className="st-title st-h3" style={{ marginTop: room.topic ? 4 : 0 }}>{room.goal}</p>}
          </Card>
        )}

        {goalPct !== null && room.goalMinutes && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <p className="st-title st-h3">This week</p>
              <p className="st-small st-muted">{minutesLabel(d.totalMinutes)} of {minutesLabel(room.goalMinutes)}</p>
            </div>
            <div style={{ marginTop: 8 }}><ProgressBar value={goalPct} label="Room goal this week" /></div>
            <p className="st-tiny st-faint" style={{ marginTop: 6 }}>Counts the last 7 days, from the {d.sharingCount} {d.sharingCount === 1 ? 'person who shares' : 'people who share'} their minutes (you are always included).</p>
          </Card>
        )}

        {owner && room.code && (
          <Card>
            <p className="st-label">Invite code</p>
            <p className="st-title" style={{ fontSize: 30, letterSpacing: '0.25em', marginTop: 2 }}>{room.code}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Btn small onClick={() => void copyCode()}>{typeof navigator.share === 'function' ? <><Share2 size={14} /> Share</> : <><Copy size={14} /> Copy</>}</Btn>
              <Btn small kind="ghost" busy={busy} onClick={() => void newCode()}><RefreshCw size={14} /> New code</Btn>
            </div>
            <p className="st-tiny st-faint" style={{ marginTop: 8 }}>Only people you give this code to can join. Making a new code stops the old one from working.</p>
          </Card>
        )}

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="st-eyebrow">People</p>
            {room.memberCount > 1 && <Btn small kind="ghost" onClick={() => setCheerFor('all')}><Smile size={14} /> Cheer everyone</Btn>}
          </div>
          {d.members.map((m) => (
            <div key={m.userId} className="st-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar m={m} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="st-title st-h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}{m.isMe ? ' (you)' : ''}</p>
                <p className="st-tiny st-muted">
                  {m.role === 'owner' ? 'Made the room' : 'Member'}
                  {m.minutes !== null ? ' · ' + minutesLabel(m.minutes) + ' this week' : m.isMe ? '' : ' · minutes not shared'}
                  {m.studyingNow ? ' · focusing now' : ''}
                </p>
              </div>
              {!m.isMe && <button className="st-icon-btn" aria-label={'Cheer ' + m.displayName} onClick={() => setCheerFor(m)}><Smile size={17} /></button>}
              {owner && !m.isMe && <button className="st-icon-btn" aria-label={'Remove ' + m.displayName} onClick={() => setSheet({ remove: m })}><UserMinus size={17} /></button>}
            </div>
          ))}
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <p className="st-eyebrow">What you share with this room</p>
          <Toggle on={d.me.shareMinutes} onChange={(v) => void share({ minutes: v })} label="Share my study minutes" hint="Friends see how many minutes you studied in the last 7 days." />
          <Toggle on={d.me.shareStatus} onChange={(v) => void share({ status: v })} label="Show when I am focusing" hint="A green dot appears while a focus session of yours is running." />
          <p className="st-tiny st-faint">Both are off until you turn them on. Nothing else about you is shown: not your marks, tasks, chats or notes.</p>
        </section>

        {d.cheers.length > 0 && (
          <section style={{ display: 'grid', gap: 6 }}>
            <p className="st-eyebrow">Recent cheers</p>
            {d.cheers.map((c) => {
              const k = CHEERS.find((x) => x.kind === c.kind);
              return <p key={c.id} className="st-small st-muted">{c.mine ? 'You' : c.from} {k?.said || 'cheered'} {c.toMe ? 'you' : c.to || 'everyone'}: “{k?.label}”</p>;
            })}
          </section>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          <Btn kind="ghost" onClick={() => setSheet('leave')}><LogOut size={16} /> Leave the room</Btn>
          {owner && <Btn kind="warn" onClick={() => setSheet('delete')}><Trash2 size={16} /> Close the room for everyone</Btn>}
        </div>
      </div></div>

      {cheerFor && (
        <Sheet title={cheerFor === 'all' ? 'Cheer everyone' : 'Cheer ' + cheerFor.displayName} onClose={() => setCheerFor(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {CHEERS.map((c) => <button key={c.kind} className="st-row-btn" disabled={busy} onClick={() => void sendCheer(c.kind)}><span style={{ color: 'var(--st-accent)' }}>{c.icon}</span><span className="st-title st-h3">{c.label}</span></button>)}
          </div>
          <p className="st-tiny st-faint" style={{ marginTop: 10 }}>Only these kind words, no typing. Up to 20 a day.</p>
        </Sheet>
      )}
      {sheet === 'edit' && <RoomForm title="Edit the room" edit={{ id, name: room.name, topic: room.topic, goal: room.goal, goalMinutes: room.goalMinutes }} onClose={() => setSheet(null)} onDone={() => { setSheet(null); void load(); }} />}
      {sheet === 'leave' && (
        <Sheet title="Leave this room?" onClose={() => setSheet(null)}>
          <p className="st-small st-muted">{owner ? (room.memberCount > 1 ? 'The room goes to the member who has been here the longest.' : 'You are the only one here, so the room will be closed.') : 'You can join again later with the code.'}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><Btn kind="ghost" onClick={() => setSheet(null)}>Stay</Btn><Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void leave()}>Leave</Btn></div>
        </Sheet>
      )}
      {sheet === 'delete' && (
        <Sheet title="Close this room?" onClose={() => setSheet(null)}>
          <p className="st-small st-muted">The room and its cheers are removed for everyone. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><Btn kind="ghost" onClick={() => setSheet(null)}>Keep it</Btn><Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void del()}>Close the room</Btn></div>
        </Sheet>
      )}
      {sheet && typeof sheet === 'object' && 'remove' in sheet && (
        <Sheet title={'Remove ' + sheet.remove.displayName + '?'} onClose={() => setSheet(null)}>
          <p className="st-small st-muted">They will no longer be in this room. They can join again only if you share the code with them.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><Btn kind="ghost" onClick={() => setSheet(null)}>Keep them</Btn><Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void removeMember(sheet.remove)}>Remove</Btn></div>
        </Sheet>
      )}
    </>
  );
};
export default Room;
