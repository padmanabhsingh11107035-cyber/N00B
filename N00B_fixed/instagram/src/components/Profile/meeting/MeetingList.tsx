import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, Loader2, Play, Repeat, Search, UserPlus, Users, X, Radio } from 'lucide-react';
import type { User } from '../../../types';
import { fetchMyLiveLoungeMeetings, fetchMyLiveLoungeAssistants, setLiveLoungeAssistant, type LiveLoungeMeeting } from '../../../services/api';
import { formatInZone, formatMeetingId, defaultTimeZone, recurrenceText } from '../../../utils/meetingCalendar';

// "Upcoming meetings": what I host, what I am invited to, soonest first, with a button to start or join, and a small panel for
// choosing who may schedule meetings in my name.

interface MeetingListProps {
  currentUser: User;
  allUsers: User[];
  onBack: () => void;
  onOpen: (meeting: LiveLoungeMeeting) => void;
  onStart: (meeting: LiveLoungeMeeting) => void;
  onJoin: (meeting: LiveLoungeMeeting) => void;
  onSchedule: () => void;
}

const dayLabel = (iso: string, tz: string): string => {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const now = new Date();
  const k = key(new Date(iso));
  if (k === key(now)) return 'Today';
  if (k === key(new Date(now.getTime() + 86400000))) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
};

export const MeetingList: React.FC<MeetingListProps> = ({ currentUser, allUsers, onBack, onOpen, onStart, onJoin, onSchedule }) => {
  const [meetings, setMeetings] = useState<LiveLoungeMeeting[] | null | undefined>(undefined);
  const [assistants, setAssistants] = useState<{ allowed: { userId: string; username: string; avatar?: string }[]; hostsForMe: { userId: string; username: string }[] }>({ allowed: [], hostsForMe: [] });
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const myZone = defaultTimeZone();

  const load = () => { fetchMyLiveLoungeMeetings(60).then((l) => setMeetings(l)); fetchMyLiveLoungeAssistants().then(setAssistants); };
  useEffect(load, []);

  const groups = useMemo(() => {
    const out: { label: string; items: LiveLoungeMeeting[] }[] = [];
    for (const m of meetings || []) {
      const label = dayLabel(m.occurrenceStart || m.scheduledFor, myZone);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m); else out.push({ label, items: [m] });
    }
    return out;
  }, [meetings, myZone]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const have = new Set(assistants.allowed.map((a) => a.userId));
    return allUsers.filter((u) => u.id !== currentUser.id && !u.isAi && !have.has(u.id) && u.username.toLowerCase().includes(q)).slice(0, 6);
  }, [query, allUsers, assistants, currentUser.id]);

  const toggleAssistant = async (userId: string, allowed: boolean) => {
    const res = await setLiveLoungeAssistant(userId, allowed);
    setNote(res.success ? '' : res.error || 'Could not save that.');
    setQuery('');
    fetchMyLiveLoungeAssistants().then(setAssistants);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onBack} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-sm font-bold text-white flex-1">Upcoming meetings</h2>
        <button onClick={onSchedule} className="flex items-center gap-1.5 text-xs font-bold text-purple-200 bg-purple-500/20 hover:bg-purple-500/30 px-3 py-1.5 rounded-xl cursor-pointer"><CalendarPlus className="w-3.5 h-3.5" /> Schedule</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg w-full mx-auto space-y-5 pb-10">
        {meetings === undefined ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 text-purple-300 animate-spin" /></div>
        ) : meetings === null ? (
          <p className="text-xs text-zinc-400 text-center py-12">Meetings could not be loaded. Check your connection and try again.</p>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center"><CalendarPlus className="w-6 h-6 text-purple-300" /></div>
            <p className="text-sm font-bold text-white">No meetings planned</p>
            <p className="text-xs text-zinc-500">Plan one for later, and invite people to it.</p>
            <button onClick={onSchedule} className="px-4 py-2.5 rounded-xl bg-purple-500 text-white text-xs font-extrabold cursor-pointer">Schedule a meeting</button>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="space-y-2">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-1">{g.label}</h3>
              {g.items.map((m) => {
                const at = m.occurrenceStart || m.scheduledFor;
                return (
                  <div key={m.id + at} className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                    <button onClick={() => onOpen(m)} className="w-full text-left cursor-pointer">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white break-words">{m.title}</p>
                        {m.liveRoomId && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300"><Radio className="w-3 h-3" /> Live now</span>}
                        {m.recurrence !== 'none' && <Repeat className="w-3 h-3 text-purple-300" aria-label={recurrenceText(m)} />}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{formatInZone(at, m.timezone, m.timezone !== myZone)}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">ID {formatMeetingId(m.meetingCode)} · {m.isHost ? 'You host' : `Host @${m.hostUsername}`}{m.isHost && (m.invitedCount || 0) > 0 ? ` · ${m.invitedCount} invited` : ''}</p>
                    </button>
                    <div className="flex gap-2">
                      {m.isHost ? (
                        <button onClick={() => onStart(m)} className="flex-1 py-2 rounded-xl bg-purple-500 hover:bg-zinc-500 text-white text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"><Play className="w-3.5 h-3.5 fill-current" /> {m.liveRoomId ? 'Rejoin' : 'Start'}</button>
                      ) : (
                        <button onClick={() => onJoin(m)} className="flex-1 py-2 rounded-xl bg-purple-500 hover:bg-zinc-500 text-white text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" /> Join</button>
                      )}
                      <button onClick={() => onOpen(m)} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white cursor-pointer">Details</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* who may plan meetings in my name */}
        <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2"><UserPlus className="w-4 h-4 text-purple-300" /> Let someone schedule for me</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">They can set up meetings with you as the host, such as a teacher's assistant or a co-organiser.</p>
          </div>
          {assistants.allowed.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {assistants.allowed.map((a) => (
                <span key={a.userId} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-[11px] text-purple-100">
                  @{a.username}
                  <button onClick={() => toggleAssistant(a.userId, false)} aria-label={`Stop letting ${a.username} schedule for me`} className="p-0.5 rounded-full hover:bg-purple-500/30 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a person to allow" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-400" />
          </div>
          {people.length > 0 && (
            <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/70">
              {people.map((u) => (
                <button key={u.id} onClick={() => toggleAssistant(u.id, true)} className="w-full flex items-center gap-2.5 p-2 text-left hover:bg-zinc-900 cursor-pointer">
                  <img src={u.avatar || '/noob-logo.svg.jpeg'} alt="" loading="lazy" className="w-7 h-7 rounded-full object-cover bg-zinc-800" />
                  <span className="text-xs font-semibold text-white truncate flex-1">@{u.username}</span>
                  <span className="text-[10px] font-bold text-purple-300">Allow</span>
                </button>
              ))}
            </div>
          )}
          {assistants.hostsForMe.length > 0 && <p className="text-[10px] text-zinc-500">You can schedule for: {assistants.hostsForMe.map((h) => '@' + h.username).join(', ')}.</p>}
          {note && <p className="text-[11px] text-rose-400">{note}</p>}
        </div>
      </div>
    </div>
  );
};
