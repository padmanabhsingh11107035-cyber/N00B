-- NOOB — a story with the "Send me anonymous messages" button is never saved to highlights.
-- Highlights are for stories the user makes and keeps on purpose; a story that only asks for anonymous
-- messages (the new button, or an anonymous Question sticker) is left out of the automatic day-highlight.
-- Everything else is saved exactly as before. The story itself is untouched (it still shows for 24 hours).

-- 1. The one place that decides what counts as an "anonymous messages" story.
create or replace function public.story_has_anonymous_button(p_stickers jsonb) returns boolean
language sql immutable set search_path = public as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_stickers) = 'array' then p_stickers else '[]'::jsonb end) e
    where e ->> 'type' = 'anon_messages'
       or (e ->> 'type' = 'question' and (e -> 'data' -> 'anonymous') = 'true'::jsonb)
  );
$$;
revoke execute on function public.story_has_anonymous_button(jsonb) from public, anon, authenticated;

-- 2. The automatic save to the day's highlight skips such stories.
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
  if public.story_has_anonymous_button(s.stickers) then return; end if;
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
revoke execute on function public.archive_story_to_highlight(public.stories) from public, anon, authenticated;

-- 3. One-time repair: anonymous-message stories that were already auto-saved are taken out of their day's
--    highlight (only those pages; any other page stays, and a highlight that held nothing else is removed).
delete from public.highlights h
where jsonb_array_length(h.items) > 0
  and not exists (select 1 from jsonb_array_elements(h.items) e where not public.story_has_anonymous_button(e -> 'stickers'));

update public.highlights h
set items = (
  select coalesce(jsonb_agg(e order by (e ->> 'createdAt')::timestamptz desc), '[]'::jsonb)
  from jsonb_array_elements(h.items) e
  where not public.story_has_anonymous_button(e -> 'stickers')
)
where exists (select 1 from jsonb_array_elements(h.items) e where public.story_has_anonymous_button(e -> 'stickers'));
