import React, { useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, FileText, Info, KeyRound, Lock, MessageSquarePlus, Package, ShieldCheck, Sparkles, Trash2, Users, Wallet } from 'lucide-react';
import { PageShell, Section, Row, Note, Spinner } from '../kit';
import type { PageProps } from '../types';
import { OrdersView } from '../../Store/OrdersView';
import { fetchAccountStatus, useAccountSettings } from '../../../services/settingsApi';

declare const __BUILD_ID__: string;

// Orders and payments, Help, Privacy Centre, Account Status and About.

export const OrdersPage: React.FC<PageProps> = ({ ctx, back }) => (
  <PageShell title="Orders and payments" onBack={back}>
    <Section title="Payments" note="NOOB Points are what you spend and send inside NOOB. Nothing here charges your bank card.">
      <Row icon={Wallet} label="Wallet" sub="NOOB Points and your transactions" onClick={ctx.actions.openWallet} testId="orders-wallet" />
    </Section>
    <Section title="Your orders">
      <div data-testid="orders-list"><OrdersView canManage={false} /></div>
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

export const AboutPage: React.FC<PageProps> = ({ ctx, back }) => {
  const build = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : '';
  return (
    <PageShell title="About" onBack={back}>
      <Section>
        <div className="px-5 py-7 text-center">
          <img src="/noob-logo.svg.jpeg" alt="" className="w-16 h-16 rounded-2xl mx-auto mb-3 object-cover border border-white/15" />
          <p className="text-lg font-black text-white tracking-tight">NOOB Socials</p>
          <p className="text-xs text-zinc-400 mt-1">A social app run by students</p>
        </div>
      </Section>
      <Section>
        <Row icon={Info} label="About NOOB" sub="Who we are and everything NOOB can do" onClick={ctx.actions.openAbout} testId="about-open" />
        <Row icon={FileText} label="Terms of use" onClick={ctx.actions.openTerms} />
        <Row icon={Lock} label="Privacy policy" onClick={ctx.actions.openPrivacyPolicy} />
        <Row icon={Package} label="Version" value={build ? build.slice(0, 10) : 'Latest'} />
      </Section>
    </PageShell>
  );
};
