import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Check, ChevronLeft, GraduationCap, Heart, Loader2, RefreshCw, Sparkles, UserPlus, Users, X } from 'lucide-react';
import type { User } from '../../types';
import { fetchTeamMembers, toggleFollowUser } from '../../services/api';
import { isMainAdmin } from '../../adminAccess';
import type { TeamMember } from '../../utils/ourTeam';
import { accentFor, cardNumber, followLabel, followState, initials, memberCountLabel, needsReadMore } from '../../utils/ourTeam';

// "Our Team": the people behind NOOB, as a page in the Home menu. The main administrator fills it in from the Admin Control Panel → Our Team.

interface Props {
  currentUser: User;
  onClose: () => void;
  // Opens a member's NOOB profile (the page closes first).
  onOpenProfile?: (member: TeamMember) => void;
}

const SPARKLES: Array<{ left: string; top: string; size: number; delay: string }> = [
  { left: '12%', top: '22%', size: 5, delay: '0s' }, { left: '84%', top: '16%', size: 7, delay: '0.8s' }, { left: '70%', top: '58%', size: 4, delay: '1.5s' },
  { left: '24%', top: '66%', size: 6, delay: '2.1s' }, { left: '50%', top: '8%', size: 4, delay: '0.4s' }
];

const MemberCard: React.FC<{
  member: TeamMember; index: number; onZoom: (m: TeamMember) => void;
  onFollow: (m: TeamMember) => void; followBusy: boolean; followError: string | null; onOpenProfile?: (m: TeamMember) => void;
}> = ({ member, index, onZoom, onFollow, followBusy, followError, onOpenProfile }) => {
  const accent = accentFor(index);
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const photo = member.photo && !broken ? member.photo : null;
  const long = needsReadMore(member.description);
  const fstate = followState(member);
  return (
    <article
      className="team-card draw-rise"
      style={{ '--a': accent.from, '--b': accent.to, '--glow': accent.glow, animationDelay: `${Math.min(index, 8) * 90}ms` } as React.CSSProperties}
    >
      <div className="team-card-inner force-dark">
        <button
          type="button"
          onClick={() => { if (photo) onZoom(member); }}
          className={`relative block w-full aspect-[4/5] overflow-hidden ${photo ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={photo ? `Open the photo of ${member.name}` : member.name}
        >
          {photo ? (
            <img src={photo} alt={member.name} loading="lazy" decoding="async" onError={() => setBroken(true)} className="team-portrait absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(145deg, ${accent.from}33, ${accent.to}22 60%, #111117)` }}>
              <span className="draw-sans text-[64px] leading-none italic text-white/90" style={{ textShadow: `0 0 34px ${accent.glow}` }}>{initials(member.name)}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111117] via-[#111117]/25 to-transparent" />
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[10px] font-black tracking-[0.2em] text-white/90">{cardNumber(index)}</span>
          <div className="absolute inset-x-0 bottom-0 p-4 text-left">
            <h2 className="draw-sans text-[24px] leading-[1.1] text-white break-words" style={{ textShadow: '0 2px 18px rgba(0,0,0,0.6)' }}>{member.name}</h2>
            {member.qualification && (
              <span
                className="mt-2 inline-flex items-start gap-1.5 max-w-full px-2.5 py-1 rounded-xl border text-[11px] font-bold leading-snug text-white backdrop-blur-md text-left"
                style={{ borderColor: `${accent.from}66`, background: `linear-gradient(90deg, ${accent.from}33, ${accent.to}26)` }}
              >
                <GraduationCap className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: accent.from }} />
                <span className="min-w-0 break-words">{member.qualification}</span>
              </span>
            )}
          </div>
        </button>
        {member.description && (
          <div className="px-4 pt-3 pb-4">
            <p className={`text-[13px] leading-relaxed text-zinc-300 whitespace-pre-line break-words ${long && !expanded ? 'line-clamp-3' : ''}`}>{member.description}</p>
            {long && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-[11px] font-black cursor-pointer" style={{ color: accent.from }}>
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
        {member.username && (
          <div className="px-4 pb-4 pt-1">
            <div className="flex items-center gap-2.5 pt-3 border-t border-white/8">
              <button type="button" onClick={() => onOpenProfile?.(member)} className="min-w-0 flex items-center gap-2 text-left cursor-pointer" aria-label={`Open the NOOB profile of @${member.username}`}>
                <span className="w-7 h-7 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/15">
                  {member.avatar ? <img src={member.avatar} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
                </span>
                <span className="min-w-0 text-[12px] font-bold text-zinc-200 truncate flex items-center gap-1">
                  @{member.username}{member.isVerified && <BadgeCheck className="w-3.5 h-3.5 shrink-0 text-sky-400" />}
                </span>
              </button>
              {fstate !== 'none' && (
                <button
                  type="button"
                  onClick={() => onFollow(member)}
                  disabled={followBusy}
                  className={`ml-auto shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-black flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform disabled:opacity-60 ${
                    fstate === 'follow' ? 'text-black' : 'text-white border border-white/25 bg-white/8'
                  }`}
                  style={fstate === 'follow' ? { background: `linear-gradient(90deg, ${accent.from}, ${accent.to})`, boxShadow: `0 8px 22px -10px ${accent.glow}` } : undefined}
                >
                  {followBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fstate === 'follow' ? <UserPlus className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  {followLabel(fstate)}
                </button>
              )}
            </div>
            {followError && <p className="mt-2 text-[11px] text-rose-300 leading-snug">{followError}</p>}
          </div>
        )}
      </div>
    </article>
  );
};

export const OurTeamPage: React.FC<Props> = ({ currentUser, onClose, onOpenProfile }) => {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<TeamMember | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [followError, setFollowError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const t = await fetchTeamMembers();
    if (t) setTeam(t); else setFailed(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // "Follow on NOOB": the same follow as on a profile (a private account gets a request instead).
  const toggleFollow = async (m: TeamMember) => {
    if (!m.userId || followBusy) return;
    setFollowBusy(m.id);
    setFollowError(null);
    const res: any = await toggleFollowUser(m.userId);
    setFollowBusy(null);
    if (res?.success) {
      setTeam((cur) => (cur ? cur.map((x) => (x.id === m.id ? { ...x, following: !!res.isFollowing, requested: !!res.isFollowRequested } : x)) : cur));
    } else {
      setFollowError({ id: m.id, text: String(res?.error || res?.message || 'Could not follow right now. Please try again.') });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (zoom) setZoom(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, onClose]);

  const zoomIndex = zoom && team ? team.findIndex((m) => m.id === zoom.id) : -1;

  return (
    <div className="fixed inset-0 z-[205] team-stage text-white force-dark flex flex-col" role="dialog" aria-label="Our Team">
      <div className="shrink-0 flex items-center gap-3 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/8 bg-black/30 backdrop-blur-xl">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center cursor-pointer" aria-label="Close"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 to-pink-400 flex items-center justify-center"><Users className="w-4 h-4 text-black" /></span>
          <span className="text-[14px] font-black italic tracking-tight whitespace-nowrap">OUR TEAM</span>
        </div>
        {team && team.length > 0 && (
          <span className="ml-auto px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-[11px] font-extrabold tabular-nums">{memberCountLabel(team.length)}</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <section className="relative overflow-hidden px-5 pt-9 pb-7 text-center">
          <div className="team-orb pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.28), transparent 68%)' }} />
          {SPARKLES.map((s, i) => (
            <span key={i} className="team-sparkle pointer-events-none absolute rounded-full bg-amber-100" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, boxShadow: '0 0 12px 2px rgba(253,230,138,0.7)' }} />
          ))}
          <p className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-white/12 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200">
            <Sparkles className="w-3 h-3" /> The people behind NOOB
          </p>
          <h1 className="relative draw-sans team-title mt-4 text-[42px] leading-[1.05] italic">Meet our team</h1>
          <p className="relative mt-3 text-[13px] leading-relaxed text-zinc-300 max-w-xs mx-auto">The builders, designers and dreamers who make NOOB for you, every single day.</p>
        </section>

        <div className="px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] max-w-5xl mx-auto">
          {failed ? (
            <div className="max-w-sm mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
              <p className="text-sm font-bold">The team could not load</p>
              <p className="text-xs text-zinc-400">Check your connection and try again. If it keeps happening, the update may still be installing.</p>
              <button onClick={() => void load()} className="px-5 py-2.5 rounded-xl bg-white text-black text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
            </div>
          ) : !team ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-md sm:max-w-none mx-auto" aria-busy="true">
              {[0, 1].map((i) => <div key={i} className="aspect-[4/5] rounded-[28px] bg-white/[0.05] border border-white/10 animate-pulse" />)}
            </div>
          ) : team.length === 0 ? (
            <div className="max-w-sm mx-auto rounded-3xl border border-white/10 bg-white/5 p-7 text-center space-y-2">
              <Users className="w-9 h-9 mx-auto text-amber-300" />
              <p className="text-sm font-bold">Our team page is coming together</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isMainAdmin(currentUser) ? 'Add the first member from the Admin panel, in the "Our Team" tab.' : 'Come back soon to meet the people behind NOOB.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-md sm:max-w-none mx-auto">
              {team.map((m, i) => (
                <MemberCard
                  key={m.id} member={m} index={i} onZoom={setZoom} onFollow={(x) => void toggleFollow(x)}
                  followBusy={followBusy === m.id} followError={followError?.id === m.id ? followError.text : null}
                  onOpenProfile={onOpenProfile ? (x) => onOpenProfile(x) : undefined}
                />
              ))}
            </div>
          )}

          {team && team.length > 0 && (
            <p className="mt-9 text-center text-[11px] font-semibold text-zinc-500 flex items-center justify-center gap-1.5">
              Made with <Heart className="w-3 h-3 text-pink-400 fill-pink-400" /> by the NOOB team
            </p>
          )}
        </div>
      </div>

      {zoom && zoom.photo && (
        <div className="fixed inset-0 z-[230] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-5" onClick={() => setZoom(null)} role="dialog" aria-label={zoom.name}>
          <button className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center cursor-pointer" onClick={() => setZoom(null)} aria-label="Close the photo"><X className="w-5 h-5" /></button>
          <div className="team-zoom max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.photo} alt={zoom.name} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-3xl object-contain" style={{ boxShadow: `0 30px 80px -24px ${accentFor(Math.max(zoomIndex, 0)).glow}` }} />
            <p className="draw-sans mt-4 text-xl">{zoom.name}</p>
            {zoom.qualification && <p className="mt-1 text-xs font-semibold text-zinc-300">{zoom.qualification}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default OurTeamPage;
