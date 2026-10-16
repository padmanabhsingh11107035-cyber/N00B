import React, { useEffect, useState } from 'react';
import { EyeOff, HeartOff, Languages, Sparkles, Star, VolumeX } from 'lucide-react';
import { PageShell, Section, Row, ToggleRow, Note, Spinner, PeopleList, useFlash } from '../kit';
import type { PageProps } from '../types';
import { setDevicePrefs, useDevicePrefs } from '../../../utils/devicePrefs';
import { addToList, fetchList, getCachedList, refreshFeedLists, removeFromList, updateMute, updateSettings, useAccountSettings, type ListedPerson } from '../../../services/settingsApi';

// What you see: muted accounts (posts, stories or both), content preferences, and like and share counts. (Favourites is a ListPage, see pages/index.ts.)

export const MutedPage: React.FC<PageProps> = ({ ctx, back }) => {
  const [people, setPeople] = useState<ListedPerson[] | null>(() => getCachedList('muted'));
  const [flash, show] = useFlash();
  const reload = async () => { const list = await fetchList('muted'); setPeople(list); void refreshFeedLists(); };
  useEffect(() => { void fetchList('muted').then(setPeople); }, []);

  const change = async (p: ListedPerson, patch: { posts?: boolean; stories?: boolean }) => {
    const posts = patch.posts ?? p.mutePosts !== false;
    const stories = patch.stories ?? p.muteStories !== false;
    if (!posts && !stories) { show('A muted account has to have posts, stories or both muted. Use Unmute to stop muting.', 'bad'); return; }
    const r = await updateMute(p.id, { posts, stories });
    if (r.success) await reload(); else show(r.error || 'Could not change that.', 'bad');
  };

  return (
    <PageShell title="Muted accounts" onBack={back} subtitle={people ? `${people.length} muted` : undefined}>
      <Note>Muting is private. You stay connected, but their posts or stories stop showing up in your feed and story tray. They are never told.</Note>
      {flash}
      <Section>
        {people === null ? <Spinner /> : (
          <PeopleList
            people={people}
            currentUserId={ctx.currentUser.id}
            addLabel="Mute"
            removeLabel="Unmute"
            emptyTitle="Nobody is muted"
            emptyText="Search for an account above to mute their posts and stories."
            searchPlaceholder="Search an account to mute"
            max={500}
            testId="list-muted"
            onAdd={async (user) => { const r = await addToList('muted', user.id, { posts: true, stories: true }); if (r.success) await reload(); else show(r.error || 'Could not mute that account.', 'bad'); }}
            onRemove={async (id) => { const r = await removeFromList('muted', id); if (r.success) { setPeople((l) => (l || []).filter((x) => x.id !== id)); void refreshFeedLists(); } else show(r.error || 'Could not unmute.', 'bad'); }}
            renderExtra={(person) => {
              const p = people.find((x) => x.id === person.id);
              if (!p) return null;
              return (
                <div className="px-4 pb-3 -mt-1 grid gap-0.5 pl-[68px]">
                  <label className="flex items-center justify-between gap-3 text-[13px] text-zinc-300 py-1.5 cursor-pointer">Mute posts and reels<input type="checkbox" className="w-4 h-4 accent-white" checked={p.mutePosts !== false} onChange={(e) => change(p, { posts: e.target.checked })} /></label>
                  <label className="flex items-center justify-between gap-3 text-[13px] text-zinc-300 py-1.5 cursor-pointer">Mute stories<input type="checkbox" className="w-4 h-4 accent-white" checked={p.muteStories !== false} onChange={(e) => change(p, { stories: e.target.checked })} /></label>
                </div>
              );
            }}
          />
        )}
      </Section>
    </PageShell>
  );
};

export const ContentPage: React.FC<PageProps> = ({ ctx, go, back }) => {
  const prefs = useDevicePrefs();
  return (
    <PageShell title="Content preferences" onBack={back}>
      <Section title="Your feed">
        <Row icon={Star} label="Favourites" sub="People whose posts you want to see first" onClick={() => go('favourites')} testId="content-favourites" />
        <Row icon={VolumeX} label="Muted accounts" sub="Posts and stories you do not want to see" onClick={() => go('muted')} />
        <Row icon={EyeOff} label="Hidden words" sub="Words you do not want in your comments" onClick={() => go('hidden-words')} />
        <Row icon={HeartOff} label="Like and share counts" onClick={() => go('like-counts')} />
      </Section>
      <Section title="Suggestions" note="Suggestions are people you may know, shown in your feed and when you search. Turning them off changes only what you see.">
        <ToggleRow icon={Sparkles} label="Suggested accounts" sub="Show people you may know" on={prefs.suggestedAccounts} onChange={(v) => setDevicePrefs({ suggestedAccounts: v })} testId="content-suggested" />
      </Section>
      <Section title="Other languages">
        <Row icon={Languages} label="Translator" sub="Translate any text into your language" onClick={ctx.actions.openTranslator} />
      </Section>
    </PageShell>
  );
};

export const LikeCountsPage: React.FC<PageProps> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const set = async (patch: Parameters<typeof updateSettings>[0], text: string) => {
    const r = await updateSettings(patch);
    if (r.success) show(text); else show(r.error || 'Could not save that.', 'bad');
  };
  return (
    <PageShell title="Like and share counts" onBack={back}>
      {flash}
      <Section title="On other people's posts" note="You can still like posts. Only the numbers are hidden, for you.">
        <ToggleRow icon={HeartOff} label="Hide like and share counts" sub="On posts and reels of other people" on={s['likes.hideOthers']} onChange={(v) => set({ 'likes.hideOthers': v }, v ? 'Counts on other people’s posts are hidden.' : 'Counts on other people’s posts are shown.')} testId="likes-hide-others" />
      </Section>
      <Section title="On your posts" note="This changes all your posts and reels now, and every new one. Only you can still see the numbers.">
        <ToggleRow icon={HeartOff} label="Hide like and share counts on all my posts" on={s['likes.hideMine']} onChange={(v) => set({ 'likes.hideMine': v }, v ? 'Counts on your posts are hidden.' : 'Counts on your posts are shown.')} testId="likes-hide-mine" />
      </Section>
    </PageShell>
  );
};
