import React, { useEffect, useState } from 'react';
import { MessageCircleQuestion, ChevronRight, Copy } from 'lucide-react';
import type { User } from '../../types';
import { fetchAskProfile, fetchAskPublicAnswers, fetchAskInbox, fetchMyMood, fetchUserMood, type AskPublicAnswer, type MoodStatus } from '../../services/api';
import { moodInfo } from '../../utils/moods';
import { funShareUrl, type FunLocation } from '../../utils/funRoutes';
import { useFeatureOn } from '../../utils/featureFlags';

// The two small cards the Fun pages put on a profile:
//   * someone else's profile: "Ask <name> anything" (anonymously), with the answers that person chose to publish. It shows nothing at all when the person is not taking questions
//     and has no published answers, so a profile that has no use for it looks exactly as before.
//   * my own profile: how many questions are waiting, and my question link.
// Both are quiet: if the database does not answer (offline, the feature not switched on yet) they simply do not appear.

interface Props {
  profileUser: User;
  isOwnProfile: boolean;
  onOpenFunPage?: (loc: FunLocation) => void;
}

export const ProfileAskCard: React.FC<Props> = ({ profileUser, isOwnProfile, onOpenFunPage }) => {
  const pageOn = useFeatureOn('fun-ask');   // the administrator can switch the Ask Me Anything page off for users
  const [enabled, setEnabled] = useState(false);
  const [answers, setAnswers] = useState<AskPublicAnswer[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    const run = async () => {
      try {
        if (isOwnProfile) {
          const inbox = await fetchAskInbox({ filter: 'new', limit: 1 });
          if (alive) { setWaiting(inbox.counts.new); setReady(true); }
          return;
        }
        const [p, a] = await Promise.all([fetchAskProfile(profileUser.username), fetchAskPublicAnswers(profileUser.username, { limit: 3 })]);
        if (!alive) return;
        setEnabled(!!p?.enabled);
        setAnswers(a.answers);
        setReady(true);
      } catch {
        /* not available: the card just stays away */
      }
    };
    void run();
    return () => { alive = false; };
  }, [profileUser.id, profileUser.username, isOwnProfile]);

  if (!pageOn || !ready || !onOpenFunPage) return null;

  if (isOwnProfile) {
    const link = funShareUrl({ feature: 'ask', target: profileUser.username });
    return (
      <div className="no-doodle mb-5 rounded-3xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-3" aria-label="Your anonymous questions">
        <div className="w-10 h-10 rounded-full bg-noob text-black flex items-center justify-center shrink-0"><MessageCircleQuestion className="w-5 h-5" aria-hidden="true" /></div>
        <button type="button" onClick={() => onOpenFunPage({ feature: 'ask' })} className="min-w-0 flex-1 text-left cursor-pointer">
          <span className="block text-sm font-black">Ask Me Anything</span>
          <span className="block text-[11px] text-zinc-400 truncate">{waiting > 0 ? `${waiting} new anonymous question${waiting === 1 ? '' : 's'} waiting` : 'Share your link and get anonymous questions'}</span>
        </button>
        <button
          type="button"
          aria-label="Copy my question link"
          onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* the link is on the Ask page */ } }}
          className="shrink-0 h-9 px-3 rounded-full border border-zinc-700 hover:border-zinc-50 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
        ><Copy className="w-3.5 h-3.5" aria-hidden="true" />{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    );
  }

  if (!enabled && answers.length === 0) return null;
  const name = profileUser.displayName || profileUser.username;
  return (
    <section className="no-doodle mb-5 rounded-3xl bg-zinc-900 border border-zinc-800 p-4" aria-label={`Ask ${name} anything`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-200"><MessageCircleQuestion className="w-5 h-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-snug break-words [overflow-wrap:anywhere] line-clamp-2">Ask {name} anything</p>
          <p className="text-[11px] text-zinc-400">{enabled ? 'Anonymous: they will not see who asked.' : 'Not taking questions right now.'}</p>
        </div>
        {enabled && (
          <button type="button" onClick={() => onOpenFunPage({ feature: 'ask', target: profileUser.username })} className="shrink-0 h-9 px-4 rounded-full bg-noob text-black text-xs font-extrabold cursor-pointer">Ask</button>
        )}
      </div>
      {answers.length > 0 && (
        <div className="mt-3 space-y-2">
          {answers.map((a) => (
            <div key={a.id} className="rounded-2xl bg-zinc-950 border border-zinc-800 px-3.5 py-3">
              <p className="text-xs font-black break-words [overflow-wrap:anywhere] line-clamp-2">{a.question}</p>
              <p className="mt-1 text-xs text-zinc-300 break-words [overflow-wrap:anywhere] line-clamp-3 whitespace-pre-wrap">{a.answer}</p>
            </div>
          ))}
          <button type="button" onClick={() => onOpenFunPage({ feature: 'ask', target: profileUser.username })} className="w-full h-9 text-[11px] font-bold text-zinc-300 hover:text-white flex items-center justify-center gap-1 cursor-pointer">See all answers <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /></button>
        </div>
      )}
    </section>
  );
};

// The mood on a profile, under the name: only when the database says this person may see it (the owner's own setting: everyone, followers or only them, and not expired).
// On my own profile, when I have none, a quiet "Set your mood" pill opens the Mood page.
export const ProfileMoodChip: React.FC<{ userId: string; isOwnProfile: boolean; onOpenFunPage?: (loc: FunLocation) => void }> = ({ userId, isOwnProfile, onOpenFunPage }) => {
  const pageOn = useFeatureOn('fun-mood');   // the administrator can switch the Mood Status page off for users
  const [mood, setMood] = useState<MoodStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setMood(null);
    const run = isOwnProfile ? fetchMyMood() : fetchUserMood(userId);
    void run.then((m) => { if (alive) { setMood(m); setReady(true); } }).catch(() => undefined);
    return () => { alive = false; };
  }, [userId, isOwnProfile]);

  if (!pageOn || !ready) return null;
  if (!mood) {
    if (!isOwnProfile || !onOpenFunPage) return null;
    return (
      <div className="flex justify-center -mt-1">
        <button type="button" onClick={() => onOpenFunPage({ feature: 'mood' })} className="text-[11px] px-3 py-1 rounded-full border border-dashed border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-50 font-bold cursor-pointer transition-colors">+ Set your mood</button>
      </div>
    );
  }
  const info = moodInfo(mood.mood);
  const body = (
    <>
      <span className="text-base leading-none" aria-hidden="true">{info.emoji}</span>
      <span className="font-black">{info.label}</span>
      {mood.note && <span className="text-zinc-300 font-medium truncate max-w-[14rem]">· {mood.note}</span>}
    </>
  );
  const cls = 'inline-flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-full border border-zinc-600 bg-zinc-900/80 max-w-full';
  return (
    <div className="flex justify-center -mt-1">
      {isOwnProfile && onOpenFunPage ? (
        <button type="button" onClick={() => onOpenFunPage({ feature: 'mood' })} aria-label={`Your mood: ${info.label}. Change it`} className={`${cls} hover:border-zinc-50 cursor-pointer transition-colors`}>{body}</button>
      ) : (
        <span role="status" aria-label={`Mood: ${info.label}${mood.note ? `, ${mood.note}` : ''}`} className={cls}>{body}</span>
      )}
    </div>
  );
};
