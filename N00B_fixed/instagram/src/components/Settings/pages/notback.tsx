import React, { useEffect, useMemo, useState } from 'react';
// (Row is used for the locked state only)
import { Crown, UserX } from 'lucide-react';
import { PageShell, Section, Row, Note, Empty, Avatar, SmallButton } from '../kit';
import type { PageProps } from '../types';

// "People who didn't noob you back": the accounts YOU noob that do not noob you. Only for NOOB Pro Ultimate.
// Worked out on the phone from the people list (the same way the Followers / Following lists are), so nothing new is stored.

export const NotBackPage: React.FC<PageProps> = ({ ctx, back }) => {
  const me = ctx.currentUser;
  const isUltimate = me.proTier === 'ultimate';
  const [gone, setGone] = useState<Set<string>>(new Set());
  // opening the page asks for a fresh people list (so a deleted account is gone and new follows are counted)
  useEffect(() => { if (isUltimate) { try { window.dispatchEvent(new Event('noob:refresh-people')); } catch { /* the list on screen stays */ } } }, [isUltimate]);

  const people = useMemo(() => {
    const byId = new Map(ctx.allUsers.map((u) => [u.id, u] as const));
    return (me.followingIds || [])
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me.id && u.id !== 'u_noob_admin' && !u.followingIds?.includes(me.id))
      .filter((u) => !gone.has(u.id));
  }, [ctx.allUsers, me.followingIds, me.id, gone]);

  if (!isUltimate) {
    return (
      <PageShell title="People who didn’t noob you back" onBack={back}>
        <Note tone="info">This page is for NOOB Pro Ultimate members. It lists the people you noob who do not noob you back.</Note>
        <Section>
          <Row icon={Crown} label="Get NOOB Pro Ultimate" sub="Unlock this page" onClick={ctx.actions.openPro} testId="not-back-get-pro" />
        </Section>
      </PageShell>
    );
  }

  return (
    <PageShell title="People who didn’t noob you back" subtitle={people.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : undefined} onBack={back}>
      {people.length === 0 ? (
        <Section>
          <Empty icon={UserX} title="Everyone you noob noobs you back" text="When someone you noob does not noob you back, they appear here." />
        </Section>
      ) : (
        <Section note="Tap a person to open their profile. Unnoob removes them from the people you noob.">
          {people.map((u) => (
            <div key={u.id} className="nst-row" data-testid="not-back-row">
              <button type="button" onClick={() => ctx.actions.openProfile(u)} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer touch-manipulation" aria-label={`Open ${u.username}`}>
                <Avatar user={u} size={40} />
                <span className="nst-words min-w-0">
                  <span className="nst-label text-white block truncate">{u.displayName || u.username}</span>
                  <span className="nst-sub block truncate" translate="no">@{u.username}</span>
                </span>
              </button>
              <SmallButton testId="not-back-unnoob" onClick={async () => { await ctx.actions.toggleFollow(u.id); setGone((p) => new Set(p).add(u.id)); }}>Unnoob</SmallButton>
            </div>
          ))}
        </Section>
      )}
    </PageShell>
  );
};
