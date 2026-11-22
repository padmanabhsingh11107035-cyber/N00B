import React, { useEffect, useState } from 'react';
import { Archive, Heart } from 'lucide-react';
import { PageShell, Section, Spinner, Empty } from '../kit';
import type { PageProps } from '../types';
import type { Post, SavedCollection } from '../../../types';
import { fetchSavedPosts, fetchLikedPosts, fetchArchivedPosts, fetchCollections } from '../../../services/api';
import { PostThumbnailMedia } from '../../Common/PostThumbnailMedia';
import { SavedVault } from '../../Profile/SavedVault';

// Saved, Likes and Posts archive, opened INSIDE "Settings and activity" (they used to close Settings and jump to a tab of the profile). A picture opens the post viewer on top of this page;
// closing the viewer comes back here.

const Grid: React.FC<{ posts: Post[]; title: string; ctx: PageProps['ctx']; archived?: boolean; testId: string }> = ({ posts, title, ctx, archived, testId }) => (
  <div className="mt-4 grid grid-cols-3 gap-[2px] rounded-xl overflow-hidden" data-testid={testId}>
    {posts.map((post) => (
      <button key={post.id} type="button" onClick={() => ctx.actions.openPost(post, posts, title)} aria-label="Open the post" className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer">
        <PostThumbnailMedia src={post.slides?.[0]?.mediaUrl} filter={post.slides?.[0]?.filter} mediaType={post.slides?.[0]?.mediaType} alt="" className={`w-full h-full object-cover ${archived ? 'opacity-75 group-hover:opacity-100' : ''}`} />
        {archived && <span className="absolute bottom-1.5 left-1.5 bg-black/80 px-2 py-0.5 rounded text-[10px] text-amber-400 font-bold">Archived</span>}
      </button>
    ))}
  </div>
);

function useList(load: () => Promise<Post[]>): Post[] | null {
  const [list, setList] = useState<Post[] | null>(null);
  useEffect(() => { let alive = true; void load().then((l) => { if (alive) setList(l || []); }).catch(() => { if (alive) setList([]); }); return () => { alive = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return list;
}

export const SavedPage: React.FC<PageProps> = ({ ctx, back }) => {
  const saved = useList(fetchSavedPosts);
  const liked = useList(fetchLikedPosts);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const reload = () => { void fetchCollections().then(setCollections).catch(() => undefined); };
  useEffect(reload, []);
  return (
    <PageShell title="Saved" onBack={back}>
      {saved === null ? <Spinner /> : (
        <div className="mt-3" data-testid="settings-saved">
          <SavedVault savedPosts={saved} morePosts={liked || []} collections={collections} onChanged={reload} openPost={ctx.actions.openPost} />
        </div>
      )}
    </PageShell>
  );
};

export const LikedPage: React.FC<PageProps> = ({ ctx, back }) => {
  const liked = useList(fetchLikedPosts);
  return (
    <PageShell title="Likes" onBack={back} subtitle={liked ? `${liked.length} post${liked.length === 1 ? '' : 's'}` : undefined}>
      {liked === null ? <Spinner /> : liked.length === 0 ? (
        <Section><Empty icon={Heart} title="No likes yet" text="Posts you like are listed here." /></Section>
      ) : <Grid posts={liked} title="Liked" ctx={ctx} testId="settings-liked" />}
    </PageShell>
  );
};

export const PostsArchivePage: React.FC<PageProps> = ({ ctx, back }) => {
  const archived = useList(fetchArchivedPosts);
  return (
    <PageShell title="Posts archive" onBack={back} subtitle={archived ? `${archived.length} post${archived.length === 1 ? '' : 's'}` : undefined}>
      {archived === null ? <Spinner /> : archived.length === 0 ? (
        <Section><Empty icon={Archive} title="Nothing archived" text="Posts you take off your profile wait here until you bring them back. Only you can see them." /></Section>
      ) : <Grid posts={archived} title="Archive" ctx={ctx} archived testId="settings-posts-archive" />}
    </PageShell>
  );
};

