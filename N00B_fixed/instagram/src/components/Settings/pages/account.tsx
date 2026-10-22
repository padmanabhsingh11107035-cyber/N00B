import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Download, Eye, KeyRound, Lock, Smartphone, Star, Trash2, UserPlus, Users, Briefcase, Ban } from 'lucide-react';
import { LoginApprovalRow } from '../LoginApprovalRow';
import { PageShell, Section, Row, ToggleRow, Choice, Note, Spinner, Empty, PeopleList, Avatar, SmallButton, useFlash } from '../kit';
import type { PageProps } from '../types';
import type { User } from '../../../types';
import { updateCurrentUser, updateFullProfile, fetchCloseFriends, setCloseFriend, blockUser, unblockUser, fetchUserById } from '../../../services/api';
import type { CloseFriend } from '../../../services/supabaseApi';
import { addToList, fetchList, getCachedList, refreshFeedLists, removeFromList, updateSettings, useAccountSettings, type ListedPerson } from '../../../services/settingsApi';

// "Your NOOB account", its password, account type and privacy, Close Friends, Blocked, story privacy and activity status.

const isBusiness = (u: User) => u.accountType === 'business' || !!u.isBusiness;

export const AccountPage: React.FC<PageProps> = ({ ctx, go, back }) => {
  const u = ctx.currentUser;
  const a = ctx.actions;
  return (
    <PageShell title="Your NOOB account" onBack={back}>
      <Section title="Personal details">
        <Row icon={Users} label="Edit profile" sub="Name, picture, bio, links, birthday" onClick={a.editProfile} testId="account-edit-profile" />
        <Row label="Username" value={`@${u.username}`} />
        <Row label="Email" value={u.email || 'Not added'} />
        <Row label="Phone" value={u.mobileNumber ? `${u.countryCode || ''} ${u.mobileNumber}`.trim() : 'Not added'} />
      </Section>
      <Section title="Password and security">
        <Row icon={KeyRound} label="Change password" onClick={() => go('password')} testId="account-password" />
        <LoginApprovalRow />
        <Row icon={Smartphone} label="Where you are logged in" sub="Devices and login history" onClick={a.openDevices} />
        <Row icon={Lock} label="End-to-end encryption" sub="How your private chats are locked" onClick={a.openE2ee} />
      </Section>
      <Section title="Verification">
        <Row icon={BadgeCheck} label="Get verified" value={u.isVerified ? 'Verified' : undefined} onClick={a.openGetVerified} />
      </Section>
      <Section title="Ownership and control">
        <Row icon={Download} label="Download your information" sub="A readable copy of your details" onClick={a.openExport} />
        {ctx.canDeleteAccount && <Row icon={Trash2} label="Delete account" sub="Permanently remove your account and everything on it" danger onClick={a.openDeleteAccount} testId="account-delete" />}
      </Section>
    </PageShell>
  );
};

export const PasswordPage: React.FC<PageProps> = ({ ctx, back }) => {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, show] = useFlash();
  const save = async () => {
    if (next.length < 6) { show('The new password must be at least 6 characters.', 'bad'); return; }
    if (next !== again) { show('The two passwords are not the same.', 'bad'); return; }
    setBusy(true);
    try {
      const res = await updateCurrentUser({ password: next });
      if (res) ctx.onUserUpdated(res);
      setNext(''); setAgain('');
      show('Your password was changed.', 'good');
    } catch (e) {
      show((e as Error).message || 'Could not change the password. Please try again.', 'bad');
    } finally { setBusy(false); }
  };
  const input = 'w-full bg-zinc-900 border border-white/15 focus:border-white/50 rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500';
  return (
    <PageShell title="Change password" onBack={back}>
      {flash}
      <Section title="New password" note="Use at least 6 characters. You stay logged in on this device.">
        <div className="p-4 space-y-3">
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" aria-label="New password" className={input} />
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" aria-label="Type the new password again" className={input} />
          <button type="button" onClick={() => save()} disabled={busy || !next || !again} className="w-full py-3 rounded-full bg-white text-black text-sm font-extrabold disabled:opacity-40 cursor-pointer hover:bg-zinc-200">{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </Section>
    </PageShell>
  );
};

export const AccountTypePage: React.FC<PageProps> = ({ ctx, back }) => {
  const u = ctx.currentUser;
  const [kind, setKind] = useState<'personal' | 'business'>(isBusiness(u) ? 'business' : 'personal');
  const [category, setCategory] = useState(u.businessCategory || '');
  const [busy, setBusy] = useState(false);
  const [flash, show] = useFlash();
  const changed = kind !== (isBusiness(u) ? 'business' : 'personal') || (kind === 'business' && category.trim() !== (u.businessCategory || ''));
  const save = async () => {
    setBusy(true);
    const res = await updateFullProfile(kind === 'business'
      ? { accountType: 'business', isBusiness: true, businessCategory: category.trim() || 'Creator & Brand' }
      : { accountType: 'public', isBusiness: false });
    setBusy(false);
    if (res.success) { ctx.onUserUpdated(res.user); show(kind === 'business' ? 'You now have a business account.' : 'You now have a personal account.'); }
    else show(res.message || 'Could not change the account type.', 'bad');
  };
  return (
    <PageShell title="Account type and tools" onBack={back}>
      {flash}
      <Section title="Account type" note={kind === 'business' ? 'Business accounts are always public and get the Professional dashboard.' : 'Personal accounts can be public or private (see Account privacy).'}>
        <Choice value={kind} onChange={setKind} options={[
          { value: 'personal', label: 'Personal account', sub: 'For friends and everyday use' },
          { value: 'business', label: 'Business or creator account', sub: 'Insights, a category on your profile and contact details' }
        ]} />
      </Section>
      {kind === 'business' && (
        <Section title="Category">
          <div className="p-4"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Gaming creator, Digital artist" maxLength={60} aria-label="Business category" className="w-full bg-zinc-900 border border-white/15 focus:border-white/50 rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" /></div>
        </Section>
      )}
      {changed && <button type="button" onClick={() => save()} disabled={busy} className="mt-5 w-full py-3 rounded-full bg-white text-black text-sm font-extrabold disabled:opacity-40 cursor-pointer hover:bg-zinc-200">{busy ? 'Saving…' : 'Save changes'}</button>}
      {isBusiness(u) && (
        <Section title="Tools">
          <Row icon={Briefcase} label="Professional dashboard" sub="Followers, reach and your best posts" onClick={ctx.actions.openProfessionalDashboard} />
          <Row icon={Users} label="Contact details" sub="Business email, phone and address on your profile" onClick={ctx.actions.editProfile} />
        </Section>
      )}
    </PageShell>
  );
};

export const PrivacyPage: React.FC<PageProps> = ({ ctx, back }) => {
  const u = ctx.currentUser;
  const business = isBusiness(u);
  const isPrivate = u.accountType === 'private';
  const [busy, setBusy] = useState(false);
  const [flash, show] = useFlash();
  const apply = async (patch: Partial<User>, message: string) => {
    setBusy(true);
    const res = await updateFullProfile(patch);
    setBusy(false);
    if (res.success) { ctx.onUserUpdated(res.user); show(message); } else show(res.message || 'Could not save that.', 'bad');
  };
  const priv = u.privacySettings || { hideTaggedPhotos: false, blockedWords: [] };
  return (
    <PageShell title="Account privacy" onBack={back}>
      {flash}
      <Section>
        <ToggleRow icon={Lock} label="Private account" sub="Only people you approve can noob you and see your posts" on={isPrivate} disabled={busy || business} onChange={(v) => apply({ accountType: v ? 'private' : 'public' }, v ? 'Your account is private now.' : 'Your account is public now.')} testId="privacy-private" />
      </Section>
      {business && <Note>Business accounts are always public. Switch to a personal account (Account type and tools) to make it private.</Note>}
      {isPrivate && (
        <Section title="Noob requests" note="Anyone who asks to noob you is accepted straight away. You do not noob them back automatically.">
          <ToggleRow label="Accept noob requests automatically" on={priv.autoAcceptFollowRequests ?? true} disabled={busy} onChange={(v) => apply({ privacySettings: { ...priv, autoAcceptFollowRequests: v } }, v ? 'Noob requests are accepted automatically.' : 'You will approve noob requests yourself.')} />
        </Section>
      )}
      <Section title="Hide your profile" note="People you hide your profile from cannot see you, your posts or your stories.">
        <Row icon={Eye} label="Hide my profile from…" sub="Choose people" onClick={ctx.actions.openHideProfile} />
      </Section>
    </PageShell>
  );
};

export const CloseFriendsPage: React.FC<PageProps> = ({ back }) => {
  const [friends, setFriends] = useState<CloseFriend[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { void fetchCloseFriends().then((r) => { if (r.success) setFriends(r.friends); else { setFriends([]); setError(r.error || ''); } }); }, []);
  const toggle = async (f: CloseFriend, on: boolean) => {
    setFriends((l) => (l || []).map((x) => (x.id === f.id ? { ...x, isCloseFriend: on } : x)));
    const res = await setCloseFriend(f.id, on);
    if (!res.success) { setFriends((l) => (l || []).map((x) => (x.id === f.id ? { ...x, isCloseFriend: !on } : x))); setError(res.error || 'Could not update your Close Friends.'); }
  };
  const shown = useMemo(() => (friends || []).filter((f) => !query.trim() || `${f.username} ${f.displayName || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [friends, query]);
  const count = (friends || []).filter((f) => f.isCloseFriend).length;
  return (
    <PageShell title="Close Friends" onBack={back} subtitle={friends ? `${count} selected` : undefined}>
      <Note>Close Friends see the stories and Instants you share with them only. Nobody is told who is on the list. You can pick from people who noob each other with you.</Note>
      {error && <Note tone="bad">{error}</Note>}
      {friends === null ? <Spinner /> : friends.length === 0 ? (
        <Section><Empty icon={Users} title="No friends to pick yet" text="Close Friends can be people who noob you and whom you noob back." /></Section>
      ) : (
        <Section>
          <div className="p-3"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your friends" aria-label="Search your friends" className="w-full bg-zinc-900 border border-white/15 focus:border-white/50 rounded-full px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500" /></div>
          {shown.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar user={{ avatar: f.avatar || '', username: f.username }} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white truncate">@{f.username}</span><span className="block text-xs text-zinc-400 truncate">{f.displayName}</span></span>
              <button type="button" role="checkbox" aria-checked={f.isCloseFriend} aria-label={`${f.isCloseFriend ? 'Remove' : 'Add'} @${f.username}`} onClick={() => toggle(f, !f.isCloseFriend)} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center cursor-pointer text-xs font-black ${f.isCloseFriend ? 'bg-white border-white text-black' : 'border-zinc-600 text-transparent'}`}>✓</button>
            </div>
          ))}
        </Section>
      )}
    </PageShell>
  );
};

export const BlockedPage: React.FC<PageProps> = ({ ctx, back }) => {
  const ids = ctx.currentUser.blockedUserIds || [];
  const [people, setPeople] = useState<User[] | null>(null);
  const [flash, show] = useFlash();
  useEffect(() => {
    let alive = true;
    (async () => {
      const known = new Map<string, User>(ctx.allUsers.map((x): [string, User] => [x.id, x]));
      const found = ids.map((id) => known.get(id) ?? null);
      if (alive && found.every(Boolean)) { setPeople(found as User[]); return; }          // everybody is already in memory: no waiting
      const fetched = await Promise.all(ids.map((id, i) => found[i] ?? fetchUserById(id)));
      if (alive) setPeople(fetched.filter((u): u is User => !!u));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);
  const sync = (blockedUserIds: string[]) => ctx.onUserUpdated({ ...ctx.currentUser, blockedUserIds });
  return (
    <PageShell title="Blocked" onBack={back} subtitle={`${ids.length} account${ids.length === 1 ? '' : 's'}`}>
      {flash}
      <Note>Blocked accounts cannot find you, see your posts and stories, noob you or message you. They are not told.</Note>
      <Section>
        {people === null ? <Spinner /> : (
          <PeopleList
            people={people}
            currentUserId={ctx.currentUser.id}
            addLabel="Block"
            removeLabel="Unblock"
            emptyTitle="You have not blocked anyone"
            emptyText="Search above to block someone."
            searchPlaceholder="Search to block someone"
            onAdd={async (user) => { const r = await blockUser(user.id); if (r.success) { sync(r.blockedUserIds); setPeople((p) => [...(p || []), user]); show(`@${user.username} is blocked.`); } else show(r.message || 'Could not block that account.', 'bad'); }}
            onRemove={async (id) => { const r = await unblockUser(id); if (r.success) { sync(r.blockedUserIds); setPeople((p) => (p || []).filter((x) => x.id !== id)); } else show(r.message || 'Could not unblock that account.', 'bad'); }}
            testId="blocked-list"
          />
        )}
      </Section>
    </PageShell>
  );
};

/** A page that is just one list of people kept on the server (restricted, hidden story viewers, blocked commenters). */
export const ListPage: React.FC<PageProps & { kind: 'restricted' | 'comment_block' | 'story_hide' | 'favourite'; title: string; note: string; emptyTitle: string; emptyText: string; addLabel: string; removeLabel: string; max?: number }> = ({ ctx, back, kind, title, note, emptyTitle, emptyText, addLabel, removeLabel, max }) => {
  const [people, setPeople] = useState<ListedPerson[] | null>(() => getCachedList(kind));
  const [flash, show] = useFlash();
  useEffect(() => { void fetchList(kind).then(setPeople); }, [kind]);
  return (
    <PageShell title={title} onBack={back} subtitle={people ? `${people.length}${max ? ` of ${max}` : ''}` : undefined}>
      <Note>{note}</Note>
      {flash}
      <Section>
        {people === null ? <Spinner /> : (
          <PeopleList
            people={people}
            currentUserId={ctx.currentUser.id}
            max={max}
            addLabel={addLabel}
            removeLabel={removeLabel}
            emptyTitle={emptyTitle}
            emptyText={emptyText}
            onAdd={async (user) => { const r = await addToList(kind, user.id); if (r.success) { setPeople(await fetchList(kind)); if (kind === 'favourite') void refreshFeedLists(); } else show(r.error || 'Could not add that person.', 'bad'); }}
            onRemove={async (id) => { const r = await removeFromList(kind, id); if (r.success) { setPeople((p) => (p || []).filter((x) => x.id !== id)); if (kind === 'favourite') void refreshFeedLists(); } else show(r.error || 'Could not remove that person.', 'bad'); }}
            testId={`list-${kind}`}
          />
        )}
      </Section>
    </PageShell>
  );
};

export const StoryPrivacyPage: React.FC<PageProps> = (props) => {
  const { ctx, go, back } = props;
  const s = useAccountSettings();
  void ctx;
  return (
    <PageShell title="Story privacy" onBack={back}>
      <Section title="Who sees your story">
        <Row icon={Star} label="Close Friends" sub="Share a story with only a few people" onClick={() => go('close-friends')} />
        <Row icon={Ban} label="Hide story from" sub="People who will not see your stories" onClick={() => go('story-hide')} />
      </Section>
      <Section title="Replies">
        <Row icon={UserPlus} label="Who can reply to your story" value={s['msg.storyReplies'] === 'everyone' ? 'Everyone' : s['msg.storyReplies'] === 'following' ? 'People you noob' : 'Off'} onClick={() => go('messages')} />
      </Section>
    </PageShell>
  );
};

export const ActivityStatusPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const on = s['activity.status'];
  const set = async (v: boolean) => {
    const r = await updateSettings({ 'activity.status': v });
    if (r.success) { show(v ? 'People can see when you are online.' : 'Your activity status is hidden.'); } else show(r.error || 'Could not save that.', 'bad');
  };
  return (
    <PageShell title="Activity status" onBack={back}>
      {flash}
      <Section note="When this is off, others do not see the green dot next to your name. You also stop seeing it on other people. Admins can still see who is online to keep NOOB running.">
        <ToggleRow icon={Eye} label="Show activity status" sub="Let people see when you are online" on={on} onChange={(v) => set(v)} testId="activity-status-toggle" />
      </Section>
    </PageShell>
  );
};

