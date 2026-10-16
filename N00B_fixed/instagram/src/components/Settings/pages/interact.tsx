import React, { useEffect, useState } from 'react';
import { Ban, Bell, BellOff, Copy, EyeOff, Hourglass, Link2, Moon, ScanLine, Share2, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { PageShell, Section, Row, ToggleRow, Choice, Note, Spinner, Avatar, SmallButton, useFlash, Empty } from '../kit';
import type { PageProps } from '../types';
import type { User } from '../../../types';
import { fetchUsers, toggleFollowUser, updateFullProfile } from '../../../services/api';
import { updateSettings, useAccountSettings, type AccountSettings } from '../../../services/settingsApi';
import { siteOrigin } from '../../../utils/siteUrl';

// Notifications, messages, tags and mentions, comments, sharing, limit interactions, hidden words, follow and invite.

type FlashFn = (text: string, tone?: 'info' | 'good' | 'bad') => void;
async function save(patch: Partial<AccountSettings>, show: FlashFn, okText?: string) {
  const r = await updateSettings(patch);
  if (!r.success) show(r.error || 'Could not save that setting.', 'bad');
  else if (okText) show(okText);
}

const untilText = (iso: string | null): string | null => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) return null;
  return t.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

export const NotificationsPage: React.FC<PageProps> = ({ ctx, back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const pausedUntil = untilText(s['notif.pauseUntil']);
  const quiet = s['notif.quiet'];
  const pause = (hours: number) => save({ 'notif.pauseUntil': new Date(Date.now() + hours * 3600e3).toISOString() }, show, 'Notifications are paused.');
  const setQuiet = (patch: Partial<typeof quiet>) => save({ 'notif.quiet': { ...quiet, ...patch, tz: -new Date().getTimezoneOffset() } }, show);
  const toggles: Array<[keyof AccountSettings, string, string]> = [
    ['notif.likes', 'Likes', 'When someone likes your post or reel'],
    ['notif.comments', 'Comments', 'Comments and replies on what you shared'],
    ['notif.follows', 'Following and followers', 'New followers, follow requests and accepted requests'],
    ['notif.messages', 'Messages and Instants', 'New messages and Instants from friends'],
    ['notif.mentions', 'Mentions', 'When someone @mentions you in a comment'],
    ['notif.live', 'Live and meetings', 'Live Lounge invites, meetings and gifts'],
    ['notif.games', 'Games and draws', 'Challenges from friends and NOOB Draw reminders'],
    ['notif.points', 'Points and payments', 'NOOB Points sent to you and payment requests'],
    ['notif.suggestions', 'Suggested people', 'People you may know'],
    ['notif.birthdays', 'Birthdays', 'Birthdays of people you follow']
  ];
  return (
    <PageShell title="Notifications" onBack={back}>
      {flash}
      <Section title="Pause all" note="While paused you are not sent notifications from people. Messages from the NOOB team, orders and safety notices always arrive.">
        {pausedUntil ? (
          <>
            <Row icon={BellOff} label={`Paused until ${pausedUntil}`} />
            <Row icon={Bell} label="Resume notifications" onClick={() => save({ 'notif.pauseUntil': null }, show, 'Notifications are back on.')} testId="notif-resume" />
          </>
        ) : (
          <>
            <Row icon={BellOff} label="Pause for 1 hour" onClick={() => pause(1)} testId="notif-pause-1h" />
            <Row icon={BellOff} label="Pause for 8 hours" onClick={() => pause(8)} />
            <Row icon={BellOff} label="Pause for 1 day" onClick={() => pause(24)} />
            <Row icon={BellOff} label="Pause for 1 week" onClick={() => pause(24 * 7)} />
          </>
        )}
      </Section>
      <Section title="What you are told about">
        {toggles.map(([key, label, sub]) => (
          <ToggleRow key={key} label={label} sub={sub} on={s[key] as boolean} onChange={(v) => save({ [key]: v } as Partial<AccountSettings>, show)} testId={`notif-${String(key).split('.')[1]}`} />
        ))}
      </Section>
      <Section title="Quiet hours" note="During quiet hours the alert on your phone is held back. You still see everything in the app.">
        <ToggleRow icon={Moon} label="Quiet hours" on={quiet.on} onChange={(on) => setQuiet({ on })} testId="notif-quiet" />
        {quiet.on && (
          <div className="px-4 py-3 flex items-center gap-3 text-sm text-white">
            <label className="flex items-center gap-2">From <input type="time" value={quiet.from} onChange={(e) => e.target.value && void setQuiet({ from: e.target.value })} className="bg-zinc-900 border border-white/20 rounded-xl px-2 py-1.5 text-sm" /></label>
            <label className="flex items-center gap-2">to <input type="time" value={quiet.to} onChange={(e) => e.target.value && void setQuiet({ to: e.target.value })} className="bg-zinc-900 border border-white/20 rounded-xl px-2 py-1.5 text-sm" /></label>
          </div>
        )}
      </Section>
      <Section title="On this phone">
        <Row icon={Bell} label="Allow notifications on this device" sub="Install NOOB and switch on phone alerts" onClick={ctx.actions.openInstall} />
      </Section>
    </PageShell>
  );
};

export const MessagesPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  return (
    <PageShell title="Messages and story replies" onBack={back}>
      {flash}
      <Section title="Who can start a chat with you" note="Chats you already have carry on. The NOOB team can always write to you.">
        <Choice value={s['msg.who']} onChange={(v) => save({ 'msg.who': v }, show)} options={[
          { value: 'connected', label: 'People you follow and people who follow you' },
          { value: 'following', label: 'Only people you follow' },
          { value: 'nobody', label: 'No one', sub: 'Nobody new can start a chat with you' }
        ]} />
      </Section>
      <Section title="Who can reply to your stories">
        <Choice value={s['msg.storyReplies']} onChange={(v) => save({ 'msg.storyReplies': v }, show)} options={[
          { value: 'everyone', label: 'Everyone who can see your story' },
          { value: 'following', label: 'People you follow' },
          { value: 'off', label: 'Off' }
        ]} />
      </Section>
      <Section title="Read receipts" note="If you turn this off you will not see when others have read your messages either.">
        <ToggleRow icon={UserCheck} label="Show read receipts" sub="Let people see when you have read their message" on={s['msg.readReceipts']} onChange={(v) => save({ 'msg.readReceipts': v }, show)} testId="msg-receipts" />
      </Section>
    </PageShell>
  );
};

export const TagsPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const options = [
    { value: 'everyone' as const, label: 'Everyone' },
    { value: 'following' as const, label: 'People you follow' },
    { value: 'nobody' as const, label: 'No one' }
  ];
  return (
    <PageShell title="Tags and mentions" onBack={back}>
      {flash}
      <Section title="Allow tags from" note="Posts and reels cannot tag you, or invite you as a collaborator, unless this allows it.">
        <Choice value={s['tags.who']} onChange={(v) => save({ 'tags.who': v }, show)} options={options} />
      </Section>
      <Section title="Allow @mentions from" note="In comments, people you do not allow cannot @mention you. Mentions you do allow send you a notification.">
        <Choice value={s['mentions.who']} onChange={(v) => save({ 'mentions.who': v }, show)} options={options} />
      </Section>
    </PageShell>
  );
};

export const CommentsPage: React.FC<PageProps> = ({ go, back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  return (
    <PageShell title="Comments" onBack={back}>
      {flash}
      <Section title="Allow comments from" note="This applies to your posts, reels and videos. Anyone is still allowed to comment on posts where you turned comments off yourself: they cannot.">
        <Choice value={s['comments.who']} onChange={(v) => save({ 'comments.who': v }, show)} options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'both', label: 'People you follow and your followers' },
          { value: 'followers', label: 'Your followers' },
          { value: 'following', label: 'People you follow' },
          { value: 'off', label: 'Off' }
        ]} />
      </Section>
      <Section title="Keep it kind">
        <ToggleRow icon={EyeOff} label="Hide offensive comments" sub="Comments with common insults and threats are hidden from everyone but their author" on={s['comments.hideOffensive']} onChange={(v) => save({ 'comments.hideOffensive': v }, show)} testId="comments-offensive" />
        <Row icon={EyeOff} label="Hidden words" sub="Words you do not want in your comments" onClick={() => go('hidden-words')} />
        <Row icon={Ban} label="Block comments from" sub="People whose comments you never want to see" onClick={() => go('comment-block')} />
        <Row icon={UserX} label="Restricted accounts" onClick={() => go('restricted')} />
        <Row icon={Hourglass} label="Limit interactions" onClick={() => go('limit')} />
      </Section>
    </PageShell>
  );
};

export const SharingPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  return (
    <PageShell title="Sharing and reuse" onBack={back}>
      {flash}
      <Section note="When this is off, nobody can send your posts, reels or videos to someone in a chat. Links to your profile still work.">
        <ToggleRow icon={Share2} label="Allow sharing to messages" sub="Let people send your posts, reels and videos in chats" on={s['share.toMessages']} onChange={(v) => save({ 'share.toMessages': v }, show)} testId="share-messages" />
      </Section>
    </PageShell>
  );
};

const DURATIONS: Array<[string, number]> = [['1 day', 1], ['3 days', 3], ['1 week', 7], ['4 weeks', 28]];

export const LimitPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const active = untilText(s['limit.until']);
  const turnOn = (days: number) => save({ 'limit.until': new Date(Date.now() + days * 864e5).toISOString() }, show, 'Interactions are limited.');
  return (
    <PageShell title="Limit interactions" onBack={back}>
      {flash}
      <Note>Use this for a while when you get a lot of unwanted attention. People in the group you choose can still comment and reply, but only they see it, and they cannot start new chats with you. The NOOB team is never limited.</Note>
      <Section title="Who is limited">
        <Choice value={s['limit.audience']} onChange={(v) => save({ 'limit.audience': v }, show)} options={[
          { value: 'non_followers', label: 'People who do not follow you' },
          { value: 'recent_followers', label: 'People who do not follow you, and new followers', sub: 'Followers of less than 7 days' }
        ]} />
      </Section>
      {active ? (
        <Section title="Limit is on" note={`Until ${active}`}>
          <Row icon={Hourglass} label="Turn off now" onClick={() => save({ 'limit.until': null }, show, 'The limit is off.')} testId="limit-off" />
        </Section>
      ) : (
        <Section title="Turn on for">
          {DURATIONS.map(([label, days]) => <Row key={label} icon={Hourglass} label={label} onClick={() => turnOn(days)} testId={`limit-${days}`} />)}
        </Section>
      )}
    </PageShell>
  );
};

export const HiddenWordsPage: React.FC<PageProps> = ({ ctx, back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const priv = ctx.currentUser.privacySettings || { hideTaggedPhotos: false, blockedWords: [] };
  const words = priv.blockedWords || [];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const write = async (next: string[], okText: string) => {
    setBusy(true);
    const res = await updateFullProfile({ privacySettings: { ...priv, blockedWords: next } });
    setBusy(false);
    if (res.success) { ctx.onUserUpdated(res.user); show(okText); } else show(res.message || 'Could not save your words.', 'bad');
  };
  const add = () => {
    const w = draft.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (!w) return;
    if (words.includes(w)) { show('That word is already on your list.', 'bad'); return; }
    if (words.length >= 50) { show('You can keep up to 50 words.', 'bad'); return; }
    setDraft('');
    void write([...words, w], `“${w}” is hidden.`);
  };
  return (
    <PageShell title="Hidden words" onBack={back}>
      {flash}
      <Section title="Offensive comments">
        <ToggleRow icon={EyeOff} label="Hide offensive comments" sub="Common insults and threats" on={s['comments.hideOffensive']} onChange={(v) => save({ 'comments.hideOffensive': v }, show)} />
      </Section>
      <Section title="Your own words" note="A comment that contains one of these words (whole words, any capital letters) is hidden from everyone but the person who wrote it. They are not told.">
        <div className="p-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} maxLength={40} placeholder="Add a word or phrase" aria-label="Add a word or phrase" data-testid="hidden-word-input" className="flex-1 min-w-0 bg-zinc-900 border border-white/15 focus:border-white/50 rounded-full px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500" />
          <SmallButton tone="solid" onClick={add} disabled={busy || !draft.trim()} testId="hidden-word-add">Add</SmallButton>
        </div>
        {words.length === 0 ? <Empty title="No words yet" text="Words you add show up here." /> : (
          <div className="p-3 flex flex-wrap gap-2" data-testid="hidden-words">
            {words.map((w) => (
              <span key={w} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border border-white/25 bg-zinc-900 text-sm text-white">
                {w}
                <button type="button" aria-label={`Remove ${w}`} disabled={busy} onClick={() => write(words.filter((x) => x !== w), `“${w}” is no longer hidden.`)} className="w-5 h-5 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
        )}
      </Section>
    </PageShell>
  );
};

export const InvitePage: React.FC<PageProps> = ({ ctx, back }) => {
  const me = ctx.currentUser;
  const link = `${siteOrigin()}/?profile=${encodeURIComponent(me.username)}`;
  const [flash, show] = useFlash();
  const [people, setPeople] = useState<User[] | null>(null);
  const [state, setState] = useState<Record<string, 'following' | 'requested' | 'busy'>>({});
  useEffect(() => {
    let alive = true;
    const pick = (all: User[]) => {
      const following = new Set(me.followingIds || []);
      const blocked = new Set(me.blockedUserIds || []);
      const pool = all.filter((u) => u.id !== me.id && !following.has(u.id) && !blocked.has(u.id) && !u.isAi && !u.isSuspended);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool.slice(0, 8);
    };
    const ready = pick(ctx.allUsers);
    if (ready.length > 0) { setPeople(ready); return; }          // the app already has people: show them at once
    void fetchUsers('').then((all) => { if (alive) setPeople(pick(all)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);
  const copy = async () => { try { await navigator.clipboard.writeText(link); show('Link copied.'); } catch { show('Could not copy. Press and hold the link to copy it.', 'bad'); } };
  const share = async () => {
    const data = { title: 'NOOB Socials', text: `Follow me on NOOB Socials: @${me.username}`, url: link };
    try { if (navigator.share) await navigator.share(data); else await copy(); } catch { /* cancelled */ }
  };
  const follow = async (u: User) => {
    setState((s) => ({ ...s, [u.id]: 'busy' }));
    const r = await toggleFollowUser(u.id);
    setState((s) => {
      const next = { ...s };
      if (r.success && r.isFollowing) next[u.id] = 'following'; else if (r.success && r.isFollowRequested) next[u.id] = 'requested'; else delete next[u.id];
      return next;
    });
    if (!r.success) show(r.message || 'Could not follow that account.', 'bad');
  };
  return (
    <PageShell title="Follow and invite friends" onBack={back}>
      {flash}
      <Section title="Invite friends" note="Anyone who opens your link lands on your profile and can join NOOB.">
        <div className="px-4 py-3.5"><p className="text-xs text-zinc-400">Your link</p><p className="text-sm font-bold text-white break-all" data-testid="invite-link">{link}</p></div>
        <Row icon={Copy} label="Copy link" onClick={() => copy()} testId="invite-copy" />
        <Row icon={Share2} label="Share link" onClick={() => share()} />
        <Row icon={Link2} label="My QR code" sub="Show it to a friend to scan" onClick={ctx.actions.openProfileQr} />
        <Row icon={ScanLine} label="Scan a QR code" sub="Find a friend by scanning their code" onClick={ctx.actions.openQrScanner} />
      </Section>
      <Section title="People you may know">
        {people === null ? <Spinner /> : people.length === 0 ? <Empty icon={UserPlus} title="No suggestions right now" text="Check again later." /> : people.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar user={u} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white truncate">@{u.username}</span><span className="block text-xs text-zinc-400 truncate">{u.displayName}</span></span>
            {state[u.id] === 'following' ? <span className="text-xs font-bold text-zinc-400">Following</span>
              : state[u.id] === 'requested' ? <span className="text-xs font-bold text-zinc-400">Requested</span>
              : <SmallButton tone="solid" disabled={state[u.id] === 'busy'} onClick={() => follow(u)}>{state[u.id] === 'busy' ? '…' : u.accountType === 'private' ? 'Request' : 'Follow'}</SmallButton>}
          </div>
        ))}
      </Section>
    </PageShell>
  );
};
