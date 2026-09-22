-- NOOB — fixes a highlight showing the same story twice (two progress-bar segments, identical
-- photo both times). archive_story_to_highlight() appended a story's snapshot to its day's
-- highlight by blind concatenation, with no check for whether that exact story was already in
-- there — calling it twice for the same story (a retried post, or, as almost certainly happened
-- here, migration 20260922000027's one-time backfill step running more than once while its SQL
-- was being applied) left two identical copies sitting in `items`. Made idempotent, and every
-- highlight that already has this is repaired below, for every user.

-- ===========================================================================
-- 1. One-time repair: collapse any duplicate items (same id) already sitting in a highlight,
--    keeping just one copy of each, still newest-first.
-- ===========================================================================
update public.highlights h
set items = (
  select coalesce(jsonb_agg(picked.elem order by (picked.elem ->> 'createdAt')::timestamptz desc), '[]'::jsonb)
  from (
    select distinct on (elem ->> 'id') elem
    from jsonb_array_elements(h.items) elem
  ) picked
)
where (
  select count(*) from jsonb_array_elements(h.items) e
) <> (
  select count(distinct e ->> 'id') from jsonb_array_elements(h.items) e
);

-- ===========================================================================
-- 2. Make the append idempotent: drop any existing entry for this same story first, so calling
--    this twice for the same story can never produce a second copy again.
-- ===========================================================================
create or replace function public.archive_story_to_highlight(s public.stories) returns void
language plpgsql security definer set search_path = public as $$
declare
  d_key       text := to_char(s.created_at, 'YYYY-MM-DD');
  snapshot    jsonb := jsonb_build_object(
    'id', s.id, 'mediaUrl', s.media_url, 'mediaType', s.media_type, 'stickers', s.stickers, 'createdAt', s.created_at
  );
  is_poll_page boolean := exists (
    select 1 from jsonb_array_elements(coalesce(s.stickers, '[]'::jsonb)) e where e ->> 'type' = 'poll'
  );
begin
  insert into public.highlights (user_id, title, cover_url, day_key, items)
  values (s.user_id, to_char(s.created_at, 'Mon DD'), s.media_url, d_key, jsonb_build_array(snapshot))
  on conflict (user_id, day_key) do update
    set items = (
          select jsonb_agg(elem order by (elem ->> 'createdAt')::timestamptz desc)
          from jsonb_array_elements(
            (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(public.highlights.items) e
             where e ->> 'id' <> (snapshot ->> 'id'))
            || snapshot
          ) elem
        ),
        cover_url = case when is_poll_page then public.highlights.cover_url else s.media_url end;
end;
$$;
revoke execute on function public.archive_story_to_highlight(public.stories) from authenticated;
