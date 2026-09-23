-- NOOB — two independent additions:
--
-- 1) "Followed by ..." on someone else's profile (Instagram's mutual-connections line): the accounts
--    *I* follow who also follow the profile I'm looking at. Only ever computed from MY following list,
--    never from my followers — as asked. RLS on public.follows already hides anything involving an
--    account that hid itself from me, so a plain (non security-definer) function here inherits that
--    for free: nothing extra to re-implement.
create or replace function public.mutual_followers(p_target uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar
  )), '[]'::jsonb)
  from (
    select p.id, p.username, p.display_name, p.avatar
    from public.follows mine
    join public.follows theirs on theirs.follower_id = mine.followee_id
    join public.profiles p on p.id = mine.followee_id
    where mine.follower_id = auth.uid()
      and theirs.followee_id = p_target
      and mine.followee_id <> p_target
    order by p.username
    limit 50
  ) x;
$$;

grant execute on function public.mutual_followers(uuid) to authenticated;

-- 2) Chat attachments (photos, videos, voice messages) get their own folder in the shared "media"
--    bucket, exactly like posts/reels/stories/etc. already do. The bucket's allowed_mime_types
--    (image/*, video/*, audio/*, set when the bucket was created) already refuses a .zip or any other
--    file type regardless of this folder allowlist — that guard against a zip-bomb-style attachment
--    was already in place and needs no change.
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat')
  );
