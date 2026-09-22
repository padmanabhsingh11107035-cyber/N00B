-- NOOB — manual highlights: create one directly from the profile, without it ever going through
-- a 24-hour story. Sits alongside the automatic per-day, from-stories highlights added in
-- 20260922000027 — same table, same `items` snapshot shape, distinguished only by `day_key`:
-- an auto highlight's day_key is its calendar date ('YYYY-MM-DD'); a manual one gets
-- 'manual:<random>' so it can never collide with a day bucket and always gets its own row, even
-- several in one day. Only a manual highlight can be renamed, added to, or have one item removed
-- without deleting the whole thing — an auto highlight's content is managed by posting/deleting
-- the actual story (see delete_story in the previous migration), and its name always stays the
-- automatic date label, matching "if the highlight is made from story then no name is assigned".

create or replace function public.create_manual_highlight(p_title text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  hid uuid;
  d_key text := 'manual:' || gen_random_uuid()::text;
  items jsonb;
  cover text;
  title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Please add at least one photo or video for this highlight.';
  end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'A highlight can hold at most 100 items.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid(), 'mediaUrl', elem ->> 'mediaUrl',
    'mediaType', case when elem ->> 'mediaType' = 'video' then 'video' else 'image' end,
    'createdAt', now()
  )), '[]'::jsonb) into items
  from jsonb_array_elements(p_items) elem
  where coalesce(btrim(elem ->> 'mediaUrl'), '') <> '';

  if jsonb_array_length(items) = 0 then raise exception 'Please add at least one photo or video for this highlight.'; end if;
  cover := items -> 0 ->> 'mediaUrl';

  -- "if content name is added ... it would be taken as the highlight name"; otherwise fall back
  -- to the same date-style label an automatic highlight gets, so it's never left blank.
  insert into public.highlights (user_id, title, cover_url, day_key, items)
  values (me, coalesce(title, to_char(now(), 'Mon DD')), cover, d_key, items)
  returning id into hid;

  return jsonb_build_object('success', true, 'highlightId', hid);
end;
$$;

-- Only ever true for a highlight this same migration's create_manual_highlight() made.
create or replace function public.is_manual_highlight(h public.highlights) returns boolean
language sql immutable as $$ select h.day_key like 'manual:%'; $$;

create or replace function public.rename_highlight(p_highlight uuid, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; new_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then raise exception 'Highlight not found.'; end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;
  if not public.is_manual_highlight(h) then raise exception 'A highlight made from your stories keeps its automatic name.'; end if;
  if new_title is null then raise exception 'A highlight needs a name.'; end if;
  update public.highlights set title = new_title where id = p_highlight;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.add_to_highlight(p_highlight uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; new_items jsonb;
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then raise exception 'Highlight not found.'; end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;
  if not public.is_manual_highlight(h) then raise exception 'Post a new story to add to an automatic highlight.'; end if;
  if jsonb_array_length(h.items) + coalesce(jsonb_array_length(p_items), 0) > 100 then
    raise exception 'A highlight can hold at most 100 items.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gen_random_uuid(), 'mediaUrl', elem ->> 'mediaUrl',
    'mediaType', case when elem ->> 'mediaType' = 'video' then 'video' else 'image' end,
    'createdAt', now()
  )), '[]'::jsonb) into new_items
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  where coalesce(btrim(elem ->> 'mediaUrl'), '') <> '';

  if jsonb_array_length(new_items) = 0 then raise exception 'Please add at least one photo or video.'; end if;
  update public.highlights set items = items || new_items where id = p_highlight;
  return jsonb_build_object('success', true);
end;
$$;

-- Removes one item; deletes the whole highlight if that was its last one (same rule as
-- delete_story's highlight cleanup — a highlight is never left empty on the profile).
create or replace function public.remove_highlight_item(p_highlight uuid, p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; remaining jsonb;
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then return jsonb_build_object('success', true); end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;
  if not public.is_manual_highlight(h) then raise exception 'Delete the story itself to remove it from an automatic highlight.'; end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into remaining
  from jsonb_array_elements(h.items) elem where elem ->> 'id' <> p_item_id;

  if jsonb_array_length(remaining) = 0 then
    delete from public.highlights where id = p_highlight;
  else
    update public.highlights set items = remaining where id = p_highlight;
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- The client tells auto- and manual highlights apart to decide whether to show edit controls.
create or replace function public.my_highlights() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'coverUrl', h.cover_url, 'dayKey', h.day_key, 'items', h.items,
    'isManual', public.is_manual_highlight(h)
  ) order by h.day_key desc), '[]'::jsonb)
  from public.highlights h where h.user_id = auth.uid();
$$;

create or replace function public.highlights_for_user(p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'title', h.title, 'coverUrl', h.cover_url, 'dayKey', h.day_key, 'items', h.items,
    'isManual', public.is_manual_highlight(h)
  ) order by h.day_key desc), '[]'::jsonb)
  from public.highlights h where h.user_id = p_user;
$$;
