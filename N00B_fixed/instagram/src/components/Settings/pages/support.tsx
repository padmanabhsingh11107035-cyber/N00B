import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BadgeCheck, Brain, Camera, ChevronDown, FileText, Gamepad2, Handshake, Info, Instagram, KeyRound, Lock, MessageCircle, MessageSquarePlus, Package, Radio, ShieldCheck, ShoppingBag, Sparkles, Trash2, Users, Wallet } from 'lucide-react';
import { PageShell, Section, Row, Note, Spinner } from '../kit';
import type { PageProps } from '../types';
const OrdersView = lazy(() => import('../../Store/OrdersView').then((m) => ({ default: m.OrdersView })));
import { fetchAccountStatus, useAccountSettings } from '../../../services/settingsApi';
import { openTeamJoin } from '../../Team/teamJoinStore';
import { openInApp } from '../../../utils/inAppBrowser';
import { getDevicePrefs } from '../../../utils/devicePrefs';

declare const __BUILD_ID__: string;

// Orders and payments, Help, Privacy Centre, Account Status and About.

export const OrdersPage: React.FC<PageProps> = ({ ctx, back }) => (
  <PageShell title="Orders and payments" onBack={back}>
    <Section title="Payments" note="NOOB Points are what you spend and send inside NOOB. Nothing here charges your bank card.">
      <Row icon={Wallet} label="Wallet" sub="NOOB Points and your transactions" onClick={ctx.actions.openWallet} testId="orders-wallet" />
    </Section>
    <Section title="Your orders">
      <div data-testid="orders-list"><Suspense fallback={<Spinner />}><OrdersView canManage={false} /></Suspense></div>
    </Section>
  </PageShell>
);

const FAQ: Array<[string, string]> = [
  ['How do I change my username, picture or bio?', 'Open your profile and tap Edit profile (also under Settings and activity, Your NOOB account). Usernames have to be unique.'],
  ['Someone is bothering me. What can I do?', 'You can Restrict them (their comments are hidden from everyone else), Block them, hide your story from them, or use Limit interactions for a while. Go to Settings and activity, How others can interact with you. None of these tell them.'],
  ['How do I make my account private?', 'Settings and activity, Account privacy. People must then ask to follow you and you decide.'],
  ['How do I stop notifications for a while?', 'Settings and activity, Notifications. You can pause everything for an hour, a day or a week, and set quiet hours.'],
  ['I forgot my password.', 'On the log-in screen choose Forgot password. A code is sent to your email. When you are logged in you can change it under Your NOOB account, Change password.'],
  ['How do I delete my account?', 'Settings and activity, Your NOOB account, Delete account. This removes your account and everything on it for good, so download your information first if you want a copy.'],
  ['Why can’t I message someone?', 'They may only allow chats from people they follow, or they have limited interactions for a while. Their settings are private.'],
  ['What is NOOB Pro?', 'A subscription with extras like a live profile picture and a badge. See Subscriptions in Settings and activity.']
];

export const HelpPage: React.FC<PageProps> = ({ ctx, back }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <PageShell title="Help" onBack={back}>
      <Section title="Ask for help">
        <Row icon={Sparkles} label="NOOB support assistant" sub="Ask the AI helper, or talk to a person from the team" onClick={ctx.actions.openSupport} testId="help-assistant" />
        <Row icon={MessageSquarePlus} label="Report a problem or send an idea" sub="Goes straight to the NOOB team" onClick={ctx.actions.openSuggestionBox} testId="help-feedback" />
      </Section>
      <Section title="Common questions">
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} data-testid={`faq-${i}`} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.04] cursor-pointer">
              <span className="flex-1 text-[15px] font-bold text-white leading-snug">{q}</span>
              <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-500 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-4 pb-4 -mt-1 text-[13px] leading-relaxed text-zinc-300">{a}</p>}
          </div>
        ))}
      </Section>
      <Section title="Rules and policies">
        <Row icon={FileText} label="Terms of use" onClick={ctx.actions.openTerms} />
        <Row icon={Lock} label="Privacy policy" onClick={ctx.actions.openPrivacyPolicy} />
      </Section>
    </PageShell>
  );
};

const yesNo = (v: boolean, yes: string, no: string) => (v ? yes : no);

export const PrivacyCentrePage: React.FC<PageProps> = ({ ctx, go, back }) => {
  const s = useAccountSettings();
  const u = ctx.currentUser;
  const a = ctx.actions;
  const blocked = (u.blockedUserIds || []).length;
  return (
    <PageShell title="Privacy Centre" onBack={back}>
      <Section title="Privacy checkup" note="Where you stand right now. Tap a row to change it.">
        <Row icon={Lock} label="Who can see your posts" value={u.accountType === 'private' ? 'Only approved followers' : 'Everyone'} onClick={() => go('privacy')} testId="pc-privacy" />
        <Row label="Who can start a chat" value={s['msg.who'] === 'connected' ? 'Followers and following' : s['msg.who'] === 'following' ? 'People you follow' : 'No one'} onClick={() => go('messages')} />
        <Row label="Who can comment" value={{ everyone: 'Everyone', followers: 'Followers', following: 'People you follow', both: 'Followers and following', off: 'No one' }[s['comments.who']]} onClick={() => go('comments')} />
        <Row label="Who can tag you" value={{ everyone: 'Everyone', following: 'People you follow', nobody: 'No one' }[s['tags.who']]} onClick={() => go('tags')} />
        <Row label="Activity status" value={yesNo(s['activity.status'], 'Shown', 'Hidden')} onClick={() => go('activity-status')} />
        <Row label="Read receipts" value={yesNo(s['msg.readReceipts'], 'On', 'Off')} onClick={() => go('messages')} />
        <Row label="Blocked accounts" value={String(blocked)} onClick={() => go('blocked')} />
      </Section>
      <Section title="Protect your account">
        <Row icon={KeyRound} label="Change password" onClick={() => go('password')} />
        <Row icon={Users} label="Where you are logged in" onClick={a.openDevices} />
        <Row icon={ShieldCheck} label="End-to-end encryption" sub="How your private chats are locked" onClick={a.openE2ee} />
        <Row icon={Lock} label="Hide my profile" sub="Take your profile off search for a while" onClick={a.openHideProfile} />
      </Section>
      <Section title="Your data">
        <Row icon={FileText} label="Privacy policy" onClick={a.openPrivacyPolicy} />
        <Row icon={FileText} label="Terms of use" onClick={a.openTerms} />
        {ctx.canDeleteAccount && <Row icon={Trash2} label="Delete account" danger onClick={a.openDeleteAccount} />}
      </Section>
    </PageShell>
  );
};

type Status = Awaited<ReturnType<typeof fetchAccountStatus>>;
const day = (iso?: string) => { if (!iso) return undefined; try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return undefined; } };

export const AccountStatusPage: React.FC<PageProps> = ({ ctx, back }) => {
  const [st, setSt] = useState<Status | null>(null);
  useEffect(() => { void fetchAccountStatus().then(setSt); }, []);
  return (
    <PageShell title="Account Status" onBack={back}>
      {st === null ? <Spinner /> : (
        <>
          <Section>
            <div className="px-5 py-6 text-center" data-testid="account-standing">
              <BadgeCheck className={`w-10 h-10 mx-auto mb-3 ${st.standing === 'good' ? 'text-white' : 'text-red-400'}`} />
              <p className="text-base font-black text-white">{st.standing === 'good' ? 'Your account is in good standing' : 'Your account is suspended'}</p>
              {st.reason && <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{st.reason}</p>}
            </div>
          </Section>
          <Section title="Your record">
            <Row label="Reports against you that were reviewed" value={String(st.reportsAgainstHandled)} />
            <Row label="Member since" value={day(st.memberSince) || 'Unknown'} />
            <Row label="Last login" value={day(st.lastLogin) || 'Unknown'} />
          </Section>
          <Note>If something was removed by mistake, or your account is limited, ask the NOOB support assistant and a person from the team will look at it.</Note>
          <Section>
            <Row icon={Sparkles} label="Ask the support assistant" onClick={ctx.actions.openSupport} />
          </Section>
        </>
      )}
    </PageShell>
  );
};

export const AboutPage: React.FC<PageProps> = ({ ctx, go, back }) => {
  const build = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';
  return (
    <PageShell title="About" onBack={back}>
      <Section>
        <div className="px-5 py-7 text-center">
          <img src="/noob-icon-192.png" alt="NOOB" width={72} height={72} className="w-[72px] h-[72px] rounded-[22px] mx-auto mb-3 object-cover border border-white/15" />
          <p className="text-lg font-black text-white tracking-tight">NOOB Socials</p>
          <p className="text-xs text-zinc-400 mt-1">A social app run by students</p>
        </div>
      </Section>
      <Section>
        <Row icon={Info} label="About NOOB" sub="Who we are and everything NOOB can do" onClick={() => go('about-noob')} testId="about-open" />
        <Row icon={FileText} label="Terms of use" onClick={ctx.actions.openTerms} />
        <Row icon={Lock} label="Privacy policy" onClick={ctx.actions.openPrivacyPolicy} />
        <Row icon={Package} label="Version" value={build ? build.slice(0, 10) : 'Latest'} />
      </Section>
    </PageShell>
  );
};

// "About NOOB": the same story as the public About page of the website (public/about.html), but as a page inside the app, so Back brings you to the page you came from.
const FEATURES: Array<{ title: string; icon: React.ComponentType<{ className?: string }>; items: string[] }> = [
  { title: 'Share and watch', icon: Camera, items: [
    'Photo and multi-picture posts with captions, hashtags and music', 'Reels: short vertical videos with sound', 'Longer videos, with playlists',
    'Stories that last 24 hours, with polls, questions and link stickers', 'Music Hub: listen to songs and share them in posts and chats'] },
  { title: 'Chat and call', icon: MessageCircle, items: [
    'Private and group chats', 'Voice messages, photos and videos, replies and reactions', 'Voice and video calls', 'End-to-end encrypted chats', 'Translate messages into your language'] },
  { title: 'Play', icon: Gamepad2, items: [
    '50+ mini-games: Ludo, Chess, Snakes & Ladders, Monopoly, Tic-Tac-Toe, Rock Paper Scissors and many more',
    'Play against smart bots, a friend on the same phone, or someone online', 'Guess the Song, leaderboards and NOOB Points to win'] },
  { title: 'Go live', icon: Radio, items: ['Live streaming', 'Live Lounge for hosted live sessions', 'NOOB Rooms: voice rooms to talk with friends', 'Meetings you can schedule and join'] },
  { title: 'Fun and community', icon: Sparkles, items: [
    'Daily NOOB: a new challenge every day, vote for the best entry, top three win NOOB Points', 'Anonymous Messages and Ask Me Anything',
    'This or That, Mood Status and public polls', 'Suggestion Box: tell the team what to build next'] },
  { title: 'Create and learn', icon: Brain, items: [
    'NOOB AI: a friendly AI assistant', 'NOOB Study: an AI study space with plans, practice and notes', 'NOOB Draw: draw and share your own pictures', 'Customer Support with an AI helper'] },
  { title: 'Shop and rewards', icon: ShoppingBag, items: ['Shop NOOB and the NOOB Food Stall', 'NOOB Points you earn by taking part', 'NOOB Pro for extra perks'] },
  { title: 'Privacy and safety', icon: ShieldCheck, items: [
    'Public or private account, close friends, and hiding your profile from chosen people', 'Block and report people, with a team that handles reports',
    'Download or delete your data any time', 'Light and dark themes, and many languages'] }
];

const openLink = (url: string) => { if (getDevicePrefs().openLinksInApp) openInApp(url); else window.open(url, '_blank', 'noopener'); };

export const AboutNoobPage: React.FC<PageProps> = ({ back }) => (
  <PageShell title="About NOOB" onBack={back}>
    <Section>
      <div className="px-5 pt-7 pb-6 text-center">
        <img src="/noob-icon-192.png" alt="NOOB" width={72} height={72} className="w-[72px] h-[72px] rounded-[22px] mx-auto mb-3 object-cover border border-white/15" />
        <p className="text-xl font-black text-white tracking-tight">NOOB Socials</p>
        <p className="text-[13px] text-zinc-300 mt-2 leading-relaxed max-w-sm mx-auto">A free social app and website, built and run by students, for people who want to share moments, play, learn and make real friends.</p>
      </div>
    </Section>

    <Section title="About us">
      <div className="px-4 py-4 space-y-3 text-[13.5px] leading-relaxed text-zinc-200">
        <p><strong className="text-white">NOOB Socials</strong> (also written NOOB or noobsocials) is a social media website and app that students build, run and look after themselves. It lives at noobsocials.com, works in any browser, and can be installed on a phone like a normal app.</p>
        <p>Everything on NOOB is made to feel like a friendly hang-out rather than a feed to scroll: you share photos, reels and stories, chat with friends, play games together, join live rooms, take on the Daily NOOB challenge, study with an AI helper and even shop from the NOOB store. It is free to join, and you stay in control of who sees what.</p>
      </div>
    </Section>

    {FEATURES.map(({ title, icon: Icon, items }) => (
      <Section key={title}>
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="w-8 h-8 shrink-0 rounded-xl border border-white/20 bg-zinc-900 flex items-center justify-center text-white"><Icon className="w-4 h-4" /></span>
            <span className="text-[15px] font-black text-white">{title}</span>
          </div>
          <ul className="space-y-1.5 text-[13px] leading-snug text-zinc-300">
            {items.map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-zinc-500 select-none">&bull;</span><span>{t}</span></li>)}
          </ul>
        </div>
      </Section>
    ))}

    <Section title="Why students?">
      <div className="px-4 py-4 text-[13.5px] leading-relaxed text-zinc-200">
        NOOB started as a student project and is still built, tested and moderated by students. That is why it keeps changing quickly: new features come from the Suggestion Box, from the team, and from people like you.
      </div>
    </Section>

    <Section title="Follow and join">
      <Row icon={Instagram} label="Follow us on Instagram" sub="@nooob.xyz" onClick={() => openLink('https://www.instagram.com/nooob.xyz')} testId="about-instagram" />
      <Row icon={Handshake} label="Join the NOOB team" sub="The team is run by students, and new members are welcome" onClick={openTeamJoin} testId="about-join-team" />
    </Section>
  </PageShell>
);
