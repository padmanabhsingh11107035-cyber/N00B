import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Lock, Plus, RefreshCw, Search, Shield, Trash2, Users, X, Calendar, Settings2, Globe, Clock } from 'lucide-react';
import type { User } from '../../../types';
import {
  saveLiveLoungeMeeting, fetchMyLiveLoungePersonalId, fetchMyLiveLoungeAssistants,
  type LiveLoungeMeeting, type LiveLoungeMeetingForm, type MeetingKind, type MeetingRepeat
} from '../../../services/api';
import { defaultTimeZone, timeZoneList, zonedToIso, isoToZoned, randomPasscode, formatMeetingId } from '../../../utils/meetingCalendar';

// The planning form for a Live Lounge meeting: "Start now" or "Schedule for later" (or editing a planned one). Three sections:
// 1. Meeting information   2. Meeting ID and security   3. Advanced options.

interface MeetingFormProps {
  currentUser: User;
  allUsers: User[];
  mode: 'now' | 'schedule' | 'edit';
  existing?: LiveLoungeMeeting;
  onClose: () => void;
  onDone: (meeting: LiveLoungeMeeting, action: 'start' | 'saved') => void;
  // "Start now" while the meetings update is not installed on the server yet: falls back to the plain room, exactly as it used to work
  onLegacyStart?: () => void;
}

const KINDS: { id: MeetingKind; label: string }[] = [
  { id: 'meeting', label: 'Meeting' }, { id: 'class', label: 'Class / lesson' }, { id: 'webinar', label: 'Webinar / talk' },
  { id: 'interview', label: 'Interview' }, { id: 'hangout', label: 'Hangout' }
];
const REMINDERS = [0, 5, 10, 15, 30, 60];

const Section: React.FC<{ icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({ icon, title, open, onToggle, children }) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
    <button type="button" onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer">
      <span className="text-purple-300">{icon}</span>
      <span className="flex-1 text-sm font-bold text-white">{title}</span>
      {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
    </button>
    {open && <div className="px-4 pb-4 space-y-3.5 border-t border-zinc-800/70 pt-3.5">{children}</div>}
  </div>
);

const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <div>
    <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">{children}</span>
    {hint && <span className="block text-[10px] text-zinc-500 normal-case tracking-normal mt-0.5">{hint}</span>}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
    <span className="min-w-0">
      <span className="text-xs font-semibold text-white block">{label}</span>
      {hint && <span className="text-[10px] text-zinc-500 block mt-0.5">{hint}</span>}
    </span>
    <span className="relative inline-flex items-center shrink-0 mt-0.5">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <span className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-purple-500 transition-colors" />
      <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-400';

export const MeetingForm: React.FC<MeetingFormProps> = ({ currentUser, allUsers, mode, existing, onClose, onDone, onLegacyStart }) => {
  const editing = mode === 'edit' && !!existing;
  const [when, setWhen] = useState<'now' | 'later'>(mode === 'now' ? 'now' : 'later');
  const [open, setOpen] = useState({ info: true, security: mode !== 'now', advanced: false });

  // ---- 1. information
  const tz0 = existing?.timezone || defaultTimeZone();
  const start0 = existing ? isoToZoned(existing.scheduledFor, existing.timezone) : (() => {
    const t = new Date(Date.now() + 24 * 3600 * 1000);
    t.setMinutes(0, 0, 0);
    t.setHours(t.getHours() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    return { date: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`, time: `${p(t.getHours())}:${p(t.getMinutes())}` };
  })();
  const [title, setTitle] = useState(existing?.title || (mode === 'now' ? `${currentUser.displayName || currentUser.username}'s meeting` : ''));
  const [description, setDescription] = useState(existing?.description || '');
  const [kind, setKind] = useState<MeetingKind>(existing?.meetingType || 'meeting');
  const [date, setDate] = useState(start0.date);
  const [time, setTime] = useState(start0.time);
  const [hours, setHours] = useState(existing ? Math.floor(existing.durationMinutes / 60) : 1);
  const [minutes, setMinutes] = useState(existing ? existing.durationMinutes % 60 : 0);
  const [timezone, setTimezone] = useState(tz0);
  const [repeat, setRepeat] = useState<MeetingRepeat>(existing?.recurrence || 'none');
  const [every, setEvery] = useState(existing?.recurrenceInterval || 1);
  const [endMode, setEndMode] = useState<'date' | 'count'>(existing?.recurrenceCount ? 'count' : 'date');
  const [endDate, setEndDate] = useState(existing?.recurrenceEndDate || '');
  const [endCount, setEndCount] = useState(existing?.recurrenceCount || 5);
  const [hostId, setHostId] = useState<string>(existing?.hostId || currentUser.id);
  const [hostsForMe, setHostsForMe] = useState<{ userId: string; username: string }[]>([]);
  const [invitees, setInvitees] = useState<string[]>((existing?.invitees || []).map((i) => i.userId));
  const [inviteQuery, setInviteQuery] = useState('');

  // ---- 2. ID and security
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [usesPersonalId, setUsesPersonalId] = useState(!!existing?.usesPersonalId);
  const [needPass, setNeedPass] = useState(existing ? existing.hasPasscode : true);
  const [passcode, setPasscode] = useState(existing?.passcode || randomPasscode(6));
  const [waitingRoom, setWaitingRoom] = useState(existing ? existing.waitingRoom : true);
  const [joinBeforeHost, setJoinBeforeHost] = useState(!!existing?.joinBeforeHost);
  const [restrictUsers, setRestrictUsers] = useState(!!existing?.restrictUsers);
  const [restrictDomains, setRestrictDomains] = useState(!!existing?.restrictDomains);
  const [domains, setDomains] = useState((existing?.allowedDomains || []).join(', '));
  const [autoLock, setAutoLock] = useState(!!existing?.autoLock);

  // ---- 3. advanced
  const [chatEnabled, setChatEnabled] = useState(existing ? existing.chatEnabled : true);
  const [hostOnlyShare, setHostOnlyShare] = useState(!!existing?.hostOnlyScreenShare);
  const [registration, setRegistration] = useState(!!existing?.registrationRequired);
  const [approval, setApproval] = useState<'auto' | 'manual'>(existing?.registrationApproval || 'auto');
  const [breakout, setBreakout] = useState(!!existing?.breakoutEnabled);
  const [breakoutRooms, setBreakoutRooms] = useState<{ name: string; members: string[] }[]>(existing?.breakoutRooms || []);
  const [interp, setInterp] = useState<{ language: string; interpreterId?: string }[]>(existing?.interpretation || []);
  const [wrTitle, setWrTitle] = useState(existing?.waitingRoomTitle || '');
  const [wrMessage, setWrMessage] = useState(existing?.waitingRoomMessage || '');
  const [reminder, setReminder] = useState(existing ? existing.reminderMinutes : 10);
  const [passInInvite, setPassInInvite] = useState(existing ? existing.includePasscodeInInvite : true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zones = useMemo(() => timeZoneList(), []);
  const userById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);

  useEffect(() => {
    fetchMyLiveLoungePersonalId().then(setPersonalId);
    fetchMyLiveLoungeAssistants().then((a) => setHostsForMe(a.hostsForMe));
  }, []);

  const candidates = useMemo(() => {
    const q = inviteQuery.trim().toLowerCase();
    return allUsers
      .filter((u) => u.id !== hostId && u.id !== currentUser.id && !u.isAi && !invitees.includes(u.id))
      .filter((u) => !q || u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [allUsers, inviteQuery, invitees, hostId, currentUser.id]);

  const instant = when === 'now' && !editing;
  const waitingRoomOn = waitingRoom;

  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Give the meeting a title.'); setOpen((o) => ({ ...o, info: true })); return; }
    if (!instant && (!date || !time)) { setError('Choose the date and the start time.'); return; }
    if (repeat !== 'none' && !instant && ((endMode === 'date' && !endDate) || (endMode === 'count' && endCount < 2))) { setError('Say when the repeating meeting ends.'); return; }
    if (needPass && !/^[A-Za-z0-9]{4,10}$/.test(passcode.trim())) { setError('The passcode must be 4 to 10 letters or numbers.'); setOpen((o) => ({ ...o, security: true })); return; }
    const domainList = domains.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    if (restrictDomains && domainList.length === 0) { setError('Add at least one e-mail domain (for example school.edu), or turn that restriction off.'); setOpen((o) => ({ ...o, security: true })); return; }
    const duration = hours * 60 + minutes;
    if (!instant && (duration < 5 || duration > 1440)) { setError('A meeting can last from 5 minutes up to 24 hours.'); return; }

    const form: LiveLoungeMeetingForm = {
      title: title.trim(),
      description: description.trim(),
      meetingType: kind,
      instant,
      scheduledFor: instant ? undefined : zonedToIso(date, time, timezone),
      durationMinutes: instant ? Math.max(5, duration || 60) : duration,
      timezone,
      recurrence: instant ? 'none' : repeat,
      recurrenceInterval: every,
      recurrenceEndDate: repeat !== 'none' && endMode === 'date' ? endDate : null,
      recurrenceCount: repeat !== 'none' && endMode === 'count' ? endCount : null,
      usesPersonalId: !editing && usesPersonalId,
      passcode: needPass ? passcode.trim() : '',
      waitingRoom,
      waitingRoomTitle: wrTitle.trim(),
      waitingRoomMessage: wrMessage.trim(),
      joinBeforeHost: joinBeforeHost && !waitingRoom,
      restrictUsers,
      restrictDomains,
      allowedDomains: domainList,
      autoLock,
      chatEnabled,
      hostOnlyScreenShare: hostOnlyShare,
      registrationRequired: registration,
      registrationApproval: approval,
      breakoutEnabled: breakout,
      breakoutRooms: breakout ? breakoutRooms.filter((b) => b.name.trim()).map((b) => ({ name: b.name.trim(), members: b.members })) : [],
      interpretation: interp.filter((i) => i.language.trim()).map((i) => ({ language: i.language.trim(), interpreterId: i.interpreterId })),
      reminderMinutes: reminder,
      includePasscodeInInvite: passInInvite,
      inviteeIds: invitees
    };
    if (!editing && hostId !== currentUser.id) form.hostId = hostId;
    setBusy(true);
    const res = await saveLiveLoungeMeeting(form, editing ? existing!.id : undefined);
    setBusy(false);
    if (!res.success || !res.meeting) {
      if (instant && onLegacyStart && /find the function|schema cache/i.test(res.error || '')) { onLegacyStart(); return; }
      setError(res.error || 'Could not save the meeting.');
      return;
    }
    onDone(res.meeting, instant ? 'start' : 'saved');
  };

  const nameOf = (id: string) => userById.get(id)?.username || 'someone';

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onClose} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-sm font-bold text-white">{editing ? 'Edit meeting' : instant ? 'Start a meeting' : 'Schedule a meeting'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg w-full mx-auto space-y-3 pb-28">
        {!editing && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-zinc-900 border border-zinc-800">
            {(['now', 'later'] as const).map((w) => (
              <button key={w} type="button" onClick={() => setWhen(w)} className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${when === w ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
                {w === 'now' ? 'Start now' : 'Schedule for later'}
              </button>
            ))}
          </div>
        )}

        {/* ================================================================== 1. Meeting information */}
        <Section icon={<Calendar className="w-4 h-4" />} title="Meeting information" open={open.info} onToggle={() => setOpen((o) => ({ ...o, info: !o.info }))}>
          <div className="space-y-1.5">
            <Label>Topic</Label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="What is this meeting about?" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Agenda, what to bring…" className={inputCls + ' resize-none'} />
          </div>
          <div className="space-y-1.5">
            <Label>Meeting type</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value as MeetingKind)} className={inputCls}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>

          {!instant && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date</Label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
                <div className="space-y-1.5"><Label>Start time</Label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <div className="grid grid-cols-2 gap-3">
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls}>
                    {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{h} hr</option>)}
                  </select>
                  <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={inputCls}>
                    {[0, 5, 10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Time zone</Label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                  {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <Toggle checked={repeat !== 'none'} onChange={(v) => setRepeat(v ? 'weekly' : 'none')} label="Recurring meeting" hint="Repeats on its own at the same time" />
                {repeat !== 'none' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <select value={repeat} onChange={(e) => setRepeat(e.target.value as MeetingRepeat)} className={inputCls}>
                        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                      </select>
                      <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className={inputCls}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Every {n} {repeat === 'daily' ? 'day' : repeat === 'weekly' ? 'week' : 'month'}{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ends</Label>
                      <div className="flex items-center gap-2">
                        <select value={endMode} onChange={(e) => setEndMode(e.target.value as 'date' | 'count')} className={inputCls + ' !w-auto shrink-0'}>
                          <option value="date">On a date</option><option value="count">After a number of times</option>
                        </select>
                        {endMode === 'date'
                          ? <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                          : <input type="number" min={2} max={60} value={endCount} onChange={(e) => setEndCount(Number(e.target.value))} className={inputCls} />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!editing && hostsForMe.length > 0 && !instant && (
            <div className="space-y-1.5">
              <Label hint="Only people who allowed you to schedule for them">Schedule for</Label>
              <select value={hostId} onChange={(e) => setHostId(e.target.value)} className={inputCls}>
                <option value={currentUser.id}>Me</option>
                {hostsForMe.map((h) => <option key={h.userId} value={h.userId}>@{h.username}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label hint="They get a notification with the time and Meeting ID">Invite participants</Label>
            {invitees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {invitees.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-[11px] text-purple-100">
                    @{nameOf(id)}
                    <button type="button" onClick={() => setInvitees((l) => l.filter((x) => x !== id))} aria-label={`Remove ${nameOf(id)}`} className="p-0.5 rounded-full hover:bg-purple-500/30 cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder="Search people by username" className={inputCls + ' pl-9'} />
            </div>
            {inviteQuery.trim() && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/70">
                {candidates.length === 0 ? <p className="text-[11px] text-zinc-500 p-3 text-center">No one found.</p> : candidates.map((u) => (
                  <button key={u.id} type="button" onClick={() => { setInvitees((l) => [...l, u.id]); setInviteQuery(''); }} className="w-full flex items-center gap-2.5 p-2 text-left hover:bg-zinc-900 cursor-pointer">
                    <img src={u.avatar || '/noob-logo.svg.jpeg'} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-zinc-800" />
                    <span className="text-xs font-semibold text-white truncate flex-1">@{u.username}</span>
                    <Plus className="w-3.5 h-3.5 text-purple-300" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ================================================================== 2. Meeting ID and security */}
        <Section icon={<Shield className="w-4 h-4" />} title="Meeting ID and security" open={open.security} onToggle={() => setOpen((o) => ({ ...o, security: !o.security }))}>
          <div className="space-y-2">
            <Label>Meeting ID</Label>
            {editing ? (
              <p className="text-xs text-zinc-300 font-mono bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5">{formatMeetingId(existing!.meetingCode)}{existing!.usesPersonalId ? ' · Personal Meeting ID' : ''}</p>
            ) : (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer"><input type="radio" checked={!usesPersonalId} onChange={() => setUsesPersonalId(false)} /> Generate automatically</label>
                <label className={`flex items-center gap-2 text-xs cursor-pointer ${personalId && hostId === currentUser.id ? 'text-zinc-200' : 'text-zinc-600'}`}>
                  <input type="radio" checked={usesPersonalId} disabled={!personalId || hostId !== currentUser.id} onChange={() => setUsesPersonalId(true)} />
                  Use my Personal Meeting ID {personalId ? <span className="font-mono text-zinc-400">{formatMeetingId(personalId)}</span> : null}
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Toggle checked={needPass} onChange={setNeedPass} label="Passcode" hint="People must type it to join (it is added to the invitation link)" />
            {needPass && (
              <div className="flex items-center gap-2">
                <input value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10))} className={inputCls + ' font-mono tracking-widest'} />
                <button type="button" onClick={() => setPasscode(randomPasscode(6))} aria-label="New passcode" title="Make a new passcode" className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer shrink-0"><RefreshCw className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          <Toggle checked={waitingRoom} onChange={(v) => { setWaitingRoom(v); if (v) setJoinBeforeHost(false); }} label="Waiting room" hint="You let each person in one by one" />
          <Toggle checked={joinBeforeHost && !waitingRoomOn} onChange={setJoinBeforeHost} disabled={waitingRoomOn} label="Allow people to join before the host" hint={waitingRoomOn ? 'Turn the waiting room off to use this' : 'Anyone who passes the checks can come in up to 15 minutes early'} />

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-zinc-400"><b className="text-zinc-200">Everyone signs in.</b> NOOB meetings have no guests: each person joins with their own NOOB account.</p>
          </div>

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Label hint="Leave both off to let anyone with the Meeting ID and passcode in">Who may join</Label>
            <Toggle checked={restrictUsers} onChange={setRestrictUsers} label="Only the people I invite" hint="Add them under Invite participants" />
            <Toggle checked={restrictDomains} onChange={setRestrictDomains} label="Only people with these e-mail domains" hint="Matched against the e-mail on their NOOB account" />
            {restrictDomains && <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="school.edu, company.com" className={inputCls} />}
          </div>

          <Toggle checked={autoLock} onChange={setAutoLock} label="Lock the meeting when everyone invited has joined" hint="Nobody new can enter after that (you can still lock or unlock by hand)" />
        </Section>

        {/* ================================================================== 3. Advanced options */}
        <Section icon={<Settings2 className="w-4 h-4" />} title="Advanced options" open={open.advanced} onToggle={() => setOpen((o) => ({ ...o, advanced: !o.advanced }))}>
          <Toggle checked={chatEnabled} onChange={setChatEnabled} label="Allow chat in the meeting" />
          <Toggle checked={hostOnlyShare} onChange={setHostOnlyShare} label="Only the host can share the screen" />

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Toggle checked={registration} onChange={setRegistration} label="Registration" hint="People register before they can join" />
            {registration && (
              <select value={approval} onChange={(e) => setApproval(e.target.value as 'auto' | 'manual')} className={inputCls}>
                <option value="auto">Approve everyone automatically</option>
                <option value="manual">I approve each person</option>
              </select>
            )}
          </div>

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Label hint="Shown to people waiting to be let in">Waiting room message</Label>
            <input value={wrTitle} onChange={(e) => setWrTitle(e.target.value)} maxLength={80} placeholder="Title, e.g. Please wait" className={inputCls} />
            <textarea value={wrMessage} onChange={(e) => setWrMessage(e.target.value)} maxLength={300} rows={2} placeholder="Message, e.g. The host will let you in shortly." className={inputCls + ' resize-none'} />
          </div>

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Toggle checked={breakout} onChange={setBreakout} label="Breakout rooms" hint="Plan the small groups and who goes where" />
            {breakout && (
              <div className="space-y-2">
                {breakoutRooms.map((b, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={b.name} onChange={(e) => setBreakoutRooms((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={`Room ${i + 1} name`} maxLength={40} className={inputCls} />
                      <button type="button" onClick={() => setBreakoutRooms((l) => l.filter((_, j) => j !== i))} aria-label="Remove room" className="p-2 text-zinc-500 hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {invitees.length === 0 && <span className="text-[10px] text-zinc-500">Invite people first, then place them in a room.</span>}
                      {invitees.map((id) => {
                        const inRoom = b.members.includes(id);
                        return (
                          <button key={id} type="button" onClick={() => setBreakoutRooms((l) => l.map((x, j) => (j === i ? { ...x, members: inRoom ? x.members.filter((m) => m !== id) : [...x.members.filter((m) => m !== id), id] } : { ...x, members: x.members.filter((m) => m !== id) })))}
                            className={`px-2 py-1 rounded-full text-[10px] font-semibold cursor-pointer border ${inRoom ? 'bg-purple-500 text-white border-purple-400' : 'bg-zinc-950 text-zinc-400 border-zinc-700'}`}>@{nameOf(id)}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setBreakoutRooms((l) => [...l, { name: '', members: [] }])} className="w-full py-2 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-300 hover:border-purple-400 cursor-pointer flex items-center justify-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Add a room</button>
                <p className="text-[10px] text-zinc-500">The plan is saved with the meeting and each person sees their room. Moving into the rooms during the call is not live yet.</p>
              </div>
            )}
          </div>

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Label hint="Name the languages and who interprets them">Language interpretation</Label>
            {interp.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={it.language} onChange={(e) => setInterp((l) => l.map((x, j) => (j === i ? { ...x, language: e.target.value } : x)))} placeholder="Language" maxLength={30} className={inputCls} />
                <select value={it.interpreterId || ''} onChange={(e) => setInterp((l) => l.map((x, j) => (j === i ? { ...x, interpreterId: e.target.value || undefined } : x)))} className={inputCls}>
                  <option value="">Interpreter…</option>
                  {invitees.map((id) => <option key={id} value={id}>@{nameOf(id)}</option>)}
                </select>
                <button type="button" onClick={() => setInterp((l) => l.filter((_, j) => j !== i))} aria-label="Remove" className="p-2 text-zinc-500 hover:text-red-400 cursor-pointer shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setInterp((l) => [...l, { language: '' }])} className="w-full py-2 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-300 hover:border-purple-400 cursor-pointer flex items-center justify-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Add a language</button>
            {interp.length > 0 && <p className="text-[10px] text-zinc-500">Saved with the meeting and shown to everyone. A separate interpretation audio channel is not live yet.</p>}
          </div>

          <div className="space-y-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <Label hint="Add to Google, Outlook or Apple Calendar from the meeting page after saving">Calendar and invitation</Label>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <select value={reminder} onChange={(e) => setReminder(Number(e.target.value))} className={inputCls}>
                {REMINDERS.map((r) => <option key={r} value={r}>{r === 0 ? 'No reminder' : `Reminder ${r} min before`}</option>)}
              </select>
            </div>
            <Toggle checked={passInInvite} onChange={setPassInInvite} label="Include the passcode in the invitation" hint="In the invitation text and link" disabled={!needPass} />
          </div>
        </Section>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}
      </div>

      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur p-3">
        <div className="max-w-lg mx-auto">
          <button onClick={submit} disabled={busy} className="w-full py-3 rounded-2xl bg-purple-500 hover:bg-purple-400 text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {busy ? 'Saving…' : editing ? 'Save changes' : instant ? 'Start meeting' : 'Schedule meeting'}
          </button>
        </div>
      </div>
    </div>
  );
};
