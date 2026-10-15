import React, { useEffect, useState } from 'react';
import { MessageCircleQuestion, ChevronRight, Copy } from 'lucide-react';
import type { User } from '../../types';
import { fetchAskProfile, fetchAskPublicAnswers, fetchAskInbox, type AskPublicAnswer } from '../../services/api';
import { funShareUrl, type FunLocation } from '../../utils/funRoutes';

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

  if (!ready || !onOpenFunPage) return null;

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
          <p className="text-sm font-black truncate">Ask {name} anything</p>
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
