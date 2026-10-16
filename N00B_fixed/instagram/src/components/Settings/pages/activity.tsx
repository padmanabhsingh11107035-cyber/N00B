import React, { useEffect, useState } from 'react';
import { Archive, Bookmark, Clock, Download, Heart, Image as ImageIcon, MessageSquare, Moon, Play, Search, Trash2, X, Zap } from 'lucide-react';
import { PageShell, Section, Row, ToggleRow, Choice, Note, Spinner, Empty, SmallButton, useFlash } from '../kit';
import type { PageProps } from '../types';
import { deleteComment, deleteStory } from '../../../services/api';
import { fetchMyComments, fetchStoriesArchive, type ArchivedStory, type MyComment } from '../../../services/settingsApi';
import { BREAK_CHOICES, DAILY_LIMIT_CHOICES, setDevicePrefs, useDevicePrefs } from '../../../utils/devicePrefs';
import { clearSearches, forgetSearch, recentSearches } from '../../../utils/searchEngine';
import { formatDuration, lastDays, secondsToday, useTimeSpentVersion } from '../../../utils/timeSpent';

// Archive, Your activity (likes, comments, time) and Time management.

const when = (iso: string) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

export const ArchivePage: React.FC<PageProps> = ({ ctx, go, back }) => (
  <PageShell title="Archive" onBack={back}>
    <Section note="Your stories are kept here for ever. Posts you archive disappear from your profile and wait here until you bring them back. (Instants are deleted for good after 24 hours.)">
      <Row icon={ImageIcon} label="Stories archive" sub="Every story you have posted" onClick={() => go('stories-archive')} testId="archive-stories" />
      <Row icon={Archive} label="Posts archive" sub="Posts you took off your profile" onClick={() => { ctx.actions.showProfileTab('archive'); ctx.actions.close(); }} />
    </Section>
  </PageShell>
);

export const StoriesArchivePage: React.FC<PageProps> = ({ back }) => {
  const [stories, setStories] = useState<ArchivedStory[] | null>(null);
  const [open, setOpen] = useState<ArchivedStory | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [flash, show] = useFlash();
  useEffect(() => { void fetchStoriesArchive().then(setStories); }, []);
  const remove = async (s: ArchivedStory) => {
    const ok = await deleteStory(s.id);
    if (ok) { setStories((l) => (l || []).filter((x) => x.id !== s.id)); setOpen(null); setConfirm(false); show('The story was deleted for good.'); }
    else show('Could not delete that story.', 'bad');
  };
  return (
    <PageShell title="Stories archive" onBack={back} subtitle={stories ? `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}` : undefined}>
      {flash}
      {stories === null ? <Spinner /> : stories.length === 0 ? (
        <Section><Empty icon={ImageIcon} title="No stories yet" text="Every story you post is saved here." /></Section>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-1.5" data-testid="stories-grid">
          {stories.map((s) => (
            <button key={s.id} type="button" onClick={() => { setOpen(s); setConfirm(false); }} aria-label={`Story from ${when(s.createdAt)}`} className="relative aspect-[9/16] rounded-xl overflow-hidden border border-white/15 bg-zinc-900 cursor-pointer group">
              {s.mediaType === 'video' ? <video src={s.mediaUrl} muted preload="metadata" playsInline className="w-full h-full object-cover" /> : <img src={s.mediaUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
              {s.mediaType === 'video' && <Play className="absolute top-1.5 right-1.5 w-4 h-4 text-white drop-shadow" />}
              <span className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[10px] font-bold text-white bg-gradient-to-t from-black/80 to-transparent text-left">{when(s.createdAt)}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label="Story">
          <div className="flex items-center justify-between p-3">
            <span className="text-xs font-bold text-white">{when(open.createdAt)} &middot; {open.viewsCount} view{open.viewsCount === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="w-9 h-9 rounded-full border border-white/25 flex items-center justify-center text-white cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-2">
            {open.mediaType === 'video' ? <video src={open.mediaUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-2xl" /> : <img src={open.mediaUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />}
          </div>
          <div className="p-4 flex justify-center gap-3">
            {confirm ? (
              <>
                <SmallButton tone="danger" onClick={() => remove(open)}>Delete for good</SmallButton>
                <SmallButton onClick={() => setConfirm(false)}>Keep it</SmallButton>
              </>
            ) : <SmallButton tone="danger" onClick={() => setConfirm(true)}><span className="inline-flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete</span></SmallButton>}
          </div>
        </div>
      )}
    </PageShell>
  );
};

export const ActivityPage: React.FC<PageProps> = ({ ctx, go, back }) => (
  <PageShell title="Your activity" onBack={back}>
    <Section title="Interactions">
      <Row icon={Heart} label="Likes" sub="Posts you liked" onClick={() => { ctx.actions.showProfileTab('liked'); ctx.actions.close(); }} testId="activity-likes" />
      <Row icon={MessageSquare} label="Comments" sub="What you wrote on posts, reels and videos" onClick={() => go('activity-comments')} testId="activity-comments" />
      <Row icon={Bookmark} label="Saved" sub="Posts you saved" onClick={() => { ctx.actions.showProfileTab('saved'); ctx.actions.close(); }} />
    </Section>
    <Section title="Your content">
      <Row icon={ImageIcon} label="Stories archive" onClick={() => go('stories-archive')} />
      <Row icon={Archive} label="Posts archive" onClick={() => { ctx.actions.showProfileTab('archive'); ctx.actions.close(); }} />
    </Section>
    <Section title="Time">
      <Row icon={Clock} label="Time on NOOB" sub="How long you used the app" onClick={() => go('time')} />
    </Section>
    <Section title="Searches">
      <Row icon={Search} label="Recent searches" sub="What you searched for on this device" onClick={() => go('searches')} testId="activity-searches" />
    </Section>
    <Section title="Your information">
      <Row icon={Download} label="Download your information" onClick={ctx.actions.openExport} />
    </Section>
  </PageShell>
);

export const MyCommentsPage: React.FC<PageProps> = ({ back }) => {
  const [list, setList] = useState<MyComment[] | null>(null);
  const [flash, show] = useFlash();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => { void fetchMyComments().then(setList); }, []);
  const remove = async (c: MyComment) => {
    const r = await deleteComment(c.targetId, c.id);
    if (r.success) { setList((l) => (l || []).filter((x) => x.id !== c.id)); setConfirmId(null); show('Comment deleted.'); } else show(r.error || 'Could not delete that comment.', 'bad');
  };
  return (
    <PageShell title="Comments" onBack={back}>
      {flash}
      {list === null ? <Spinner /> : list.length === 0 ? (
        <Section><Empty icon={MessageSquare} title="No comments yet" text="Comments you write show up here." /></Section>
      ) : (
        <Section>
          {list.map((c) => (
            <div key={c.id} className="px-4 py-3" data-testid="my-comment">
              <p className="text-sm text-white leading-snug break-words">{c.text || '…'}</p>
              <p className="text-xs text-zinc-400 mt-1">On {c.kind === 'post' ? 'a post' : c.kind === 'reel' ? 'a reel' : 'a video'}{c.targetPreview ? `: “${c.targetPreview}”` : ''} &middot; {when(c.createdAt)}</p>
              <div className="mt-2">
                {confirmId === c.id ? (
                  <span className="inline-flex gap-2"><SmallButton tone="danger" onClick={() => remove(c)}>Delete</SmallButton><SmallButton onClick={() => setConfirmId(null)}>Keep</SmallButton></span>
                ) : <SmallButton onClick={() => setConfirmId(c.id)}>Delete</SmallButton>}
              </div>
            </div>
          ))}
        </Section>
      )}
    </PageShell>
  );
};

const LIMIT_LABEL = (m: number) => (m === 0 ? 'No reminder' : m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);

export const TimePage: React.FC<PageProps> = ({ back }) => {
  const prefs = useDevicePrefs();
  useTimeSpentVersion();
  const days = lastDays(7);
  const today = secondsToday();
  const max = Math.max(1800, ...days.map((d) => d.seconds));
  const avg = Math.round(days.reduce((n, d) => n + d.seconds, 0) / 7);
  return (
    <PageShell title="Time management" onBack={back}>
      <Section title="Time on NOOB" note="Counted on this device while NOOB is open in front of you. Nothing is sent anywhere.">
        <div className="p-4">
          <p className="text-3xl font-black text-white" data-testid="time-today">{formatDuration(today)}</p>
          <p className="text-xs text-zinc-400">today &middot; daily average {formatDuration(avg)}</p>
          <div className="mt-4 flex items-end gap-2 h-28" role="img" aria-label="Time on NOOB over the last 7 days">
            {days.map((d, i) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex-1 flex items-end"><div className={`w-full rounded-t-lg ${i === days.length - 1 ? 'bg-white' : 'bg-white/45'}`} style={{ height: `${Math.max(3, Math.round((d.seconds / max) * 100))}%` }} title={`${d.label}: ${formatDuration(d.seconds)}`} /></div>
                <span className="text-[10px] text-zinc-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Daily limit" note="When you pass your limit a small reminder appears. It never locks the app.">
        <Choice value={String(prefs.dailyLimitMin)} onChange={(v) => setDevicePrefs({ dailyLimitMin: Number(v) })} options={DAILY_LIMIT_CHOICES.map((m) => ({ value: String(m), label: LIMIT_LABEL(m) }))} />
      </Section>
      <Section title="Take a break" note="A small reminder after you have been on NOOB this long in a row. Leaving for five minutes counts as a break.">
        <Choice value={String(prefs.breakEveryMin)} onChange={(v) => setDevicePrefs({ breakEveryMin: Number(v) })} options={BREAK_CHOICES.map((m) => ({ value: String(m), label: m === 0 ? 'No reminder' : `Every ${m} minutes` }))} />
      </Section>
      <Section title="Sleep mode" note="During these hours a gentle “time to rest” reminder shows when you open NOOB.">
        <ToggleRow icon={Moon} label="Sleep mode" on={prefs.sleepMode.on} onChange={(on) => setDevicePrefs({ sleepMode: { ...prefs.sleepMode, on } })} testId="sleep-toggle" />
        {prefs.sleepMode.on && (
          <div className="px-4 py-3 flex items-center gap-3 text-sm text-white">
            <label className="flex items-center gap-2">From <input type="time" value={prefs.sleepMode.from} onChange={(e) => e.target.value && setDevicePrefs({ sleepMode: { ...prefs.sleepMode, from: e.target.value } })} className="bg-zinc-900 border border-white/20 rounded-xl px-2 py-1.5 text-sm" /></label>
            <label className="flex items-center gap-2">to <input type="time" value={prefs.sleepMode.to} onChange={(e) => e.target.value && setDevicePrefs({ sleepMode: { ...prefs.sleepMode, to: e.target.value } })} className="bg-zinc-900 border border-white/20 rounded-xl px-2 py-1.5 text-sm" /></label>
          </div>
        )}
      </Section>
    </PageShell>
  );
};

export const SearchesPage: React.FC<PageProps> = ({ back }) => {
  const [list, setList] = useState<string[]>(() => recentSearches());
  return (
    <PageShell title="Recent searches" onBack={back} right={list.length > 0 ? <SmallButton tone="danger" onClick={() => { clearSearches(); setList([]); }} testId="searches-clear">Clear all</SmallButton> : undefined}>
      <Note>These are kept only on this device, so the search box can suggest them again. Nobody else sees them.</Note>
      <Section>
        {list.length === 0 ? <Empty icon={Search} title="No recent searches" text="What you search for in videos, posts and reels shows up here." /> : list.map((q) => (
          <div key={q} className="flex items-center gap-3 px-4 py-3" data-testid="search-row">
            <Search className="w-4 h-4 shrink-0 text-zinc-500" />
            <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{q}</span>
            <button type="button" aria-label={`Remove ${q}`} onClick={() => setList(forgetSearch(q))} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </Section>
    </PageShell>
  );
};
