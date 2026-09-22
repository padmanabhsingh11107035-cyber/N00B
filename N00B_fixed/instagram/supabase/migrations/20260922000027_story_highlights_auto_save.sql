-- NOOB — story/highlight redesign (22 Sep): "story and highlight are the same thing now".
--
-- Every story a person posts is now automatically folded into that day's highlight the moment
-- it's created — no manual "make a highlight" step exists anymore. Highlights group by the
-- calendar day they were posted (all of today's stories -> one "Sep 22" highlight). Crucially,
-- each highlight entry is a full SNAPSHOT of the story's content (media, stickers, timestamp),
-- not just a reference to the `stories` row — because that row is hard-deleted by
-- cleanup_expired_stories() ~25h later. Without a snapshot, every highlight would silently go
-- blank the day after it was created. This is exactly the kind of data loss this project treats
-- as the top priority to avoid.
--
-- The previous `highlights` table/RPCs (create_highlight/my_highlights) were already built but
-- were NEVER actually wired up client-side — the app only had a client-only, localStorage-based,
-- base64-media "highlights" feature that (a) never left the creating browser, so no one else —
-- and not even the same account on another device — could ever see it, and (b) had no way to
-- resolve `story_ids` back into real content even if it had been wired up. This migration
-- replaces that dead design with a real one; nothing here breaks it further since it was never
-- live.

-- ===========================================================================
-- 1. Schema: highlights become day-buckets of durable snapshots
-- ===========================================================================
alter table public.highlights
  add column if not exists day_key text not null default to_char(now(), 'YYYY-MM-DD'),
  add column if not exists items    jsonb not null default '[]';

create unique index if not exists highlights_user_day_idx on public.highlights (user_id, day_key);

-- The old manual path (pick a title/cover/stories yourself) is retired along with this: it was
-- never actually wired up client-side, and now conflicts with the one-highlight-per-day model
-- above (create_highlight has no idea about day_key/items, so it could collide with the unique
-- index or leave items empty). my_highlights() below is rewritten in place since it's the read
-- path every highlight — old or new — goes through; create_highlight is the write path nothing
-- should use anymore.
revoke execute on function public.create_highlight(text, text, jsonb) from authenticated;

-- ===========================================================================
-- 2. Archive a story into its day's highlight (insert-or-append), newest-first
-- ===========================================================================
-- Kept as its own function (rather than inlined into create_story) so the exact same logic
-- also covers the one-off backfill below, in step 4.
create or replace function public.archive_story_to_highlight(s public.stories) returns void
language plpgsql security definer set search_path = public as $$
declare
  d_key       text := to_char(s.created_at, 'YYYY-MM-DD');
  snapshot    jsonb := jsonb_build_object(
    'id', s.id, 'mediaUrl', s.media_url, 'mediaType', s.media_type, 'stickers', s.stickers, 'createdAt', s.created_at
  );
  -- A poll page (a plain colour background with just the poll on it) should never become the
  -- highlight's cover icon on the profile — the actual photo/video stays the cover instead.
  is_poll_page boolean := exists (
    select 1 from jsonb_array_elements(coalesce(s.stickers, '[]'::jsonb)) e where e ->> 'type' = 'poll'
  );
begin
  insert into public.highlights (user_id, title, cover_url, day_key, items)
  values (s.user_id, to_char(s.created_at, 'Mon DD'), s.media_url, d_key, jsonb_build_array(snapshot))
  on conflict (user_id, day_key) do update
    set items = (
          -- Newest-first, same convention the live story tray already uses (tapping a highlight
          -- starts on the most recent page of that day; "next" moves back through older ones) —
          -- re-sorted on every write so it self-heals regardless of arrival order.
          select jsonb_agg(elem order by (elem ->> 'createdAt')::timestamptz desc)
          from jsonb_array_elements(public.highlights.items || snapshot) elem
        ),
        cover_url = case when is_poll_page then public.highlights.cover_url else s.media_url end;
end;
$$;
revoke execute on function public.archive_story_to_highlight(public.stories) from authenticated;

-- ===========================================================================
-- 3. create_story now archives automatically — atomic with posting, so this step
--    can never be skipped or forgotten by the client.
-- ===========================================================================
create or replace function public.create_story(p_media_url text, p_media_type text default 'image', p_stickers jsonb default '[]', p_close_friends boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.stories;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_media_url), '') = '' then raise exception 'A story needs a picture or video.'; end if;
  insert into public.stories (user_id, media_url, media_type, stickers, is_close_friends_only)
  values (me, p_media_url, case when p_media_type = 'video' then 'video' else 'image' end, coalesce(p_stickers, '[]'::jsonb), coalesce(p_close_friends, false))
  returning * into s;
  perform public.archive_story_to_highlight(s);
  return public.story_json(s);
end;
$$;

-- ===========================================================================
-- 4. One-time backfill: fold every currently-active (not yet expired) story into its day's
--    highlight too, so nothing already posted is lost purely because of this migration's timing.
-- ===========================================================================
do $$
declare r public.stories;
begin
  for r in select * from public.stories where expires_at > now() order by created_at asc loop
    perform public.archive_story_to_highlight(r);
  end loop;
end $$;

-- ===========================================================================
-- 5. Read back full, self-contained highlight content (no join to `stories` needed —
--    works forever, even after the original story rows expire and are deleted).
-- ===========================================================================
create or replace function public.my_highlights() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'coverUrl', h.cover_url, 'dayKey', h.day_key, 'items', h.items
  ) order by h.day_key desc), '[]'::jsonb)
  from public.highlights h where h.user_id = auth.uid();
$$;

-- Same shape, for any user whose highlights you're allowed to see (the existing
-- highlights_select RLS policy already governs this: owner, admin, or can_view_author).
create or replace function public.highlights_for_user(p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'coverUrl', h.cover_url, 'dayKey', h.day_key, 'items', h.items
  ) order by h.day_key desc), '[]'::jsonb)
  from public.highlights h where h.user_id = p_user;
$$;

-- ===========================================================================
-- 6. Deleting a story now also removes it from that day's highlight (and the whole day's
--    highlight if that was its last page) — choosing to delete a story should retract it from
--    the permanent archive too, not leave a ghost copy behind. Replaces the plain client-side
--    `delete from stories` (which had no way to keep the highlight snapshot in sync).
-- ===========================================================================
create or replace function public.delete_story(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.stories;
  d_key text;
  new_items jsonb;
  new_cover text;
begin
  select * into s from public.stories where id = p_story;
  if s.id is null then return jsonb_build_object('success', true); end if;
  if s.user_id <> me and not public.is_admin() then
    raise exception 'You can only delete your own stories.' using errcode = '42501';
  end if;

  delete from public.stories where id = p_story;

  d_key := to_char(s.created_at, 'YYYY-MM-DD');

  select coalesce(jsonb_agg(elem order by (elem ->> 'createdAt')::timestamptz desc), '[]'::jsonb)
    into new_items
    from public.highlights h, jsonb_array_elements(h.items) elem
    where h.user_id = s.user_id and h.day_key = d_key and elem ->> 'id' <> p_story::text;

  -- Re-pick the cover from what's left (newest non-poll-page first) so it never keeps pointing
  -- at the page that was just removed; if everything left is a poll page, just keep the old one.
  select elem ->> 'mediaUrl' into new_cover
    from jsonb_array_elements(coalesce(new_items, '[]'::jsonb)) elem
    where not exists (select 1 from jsonb_array_elements(coalesce(elem -> 'stickers', '[]'::jsonb)) e where e ->> 'type' = 'poll')
    order by (elem ->> 'createdAt')::timestamptz desc
    limit 1;

  update public.highlights h
    set items = coalesce(new_items, '[]'::jsonb),
        cover_url = coalesce(new_cover, h.cover_url)
    where h.user_id = s.user_id and h.day_key = d_key;

  delete from public.highlights where user_id = s.user_id and day_key = d_key and items = '[]'::jsonb;

  return jsonb_build_object('success', true);
end;
$$;

-- Force every deletion through delete_story() above, so the highlight side-effect can never be
-- bypassed by a direct client-side `.from('stories').delete()` call.
revoke delete on public.stories from authenticated;
