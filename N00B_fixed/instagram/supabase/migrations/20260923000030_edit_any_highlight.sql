-- NOOB — an existing highlight made automatically from your stories had no edit entry point at
-- all: add_to_highlight/remove_highlight_item both refused to touch anything but a manually-made
-- highlight, so there was nothing on the profile that would even open the editor for one of those
-- — which is what actually looked like "picking a photo does nothing" (there was no working
-- upload button to reach, not a broken one). Both now work on any highlight you own. Only the
-- NAME stays off-limits for an automatic highlight — rename_highlight is unchanged, still
-- manual-only — matching "if the highlight is made from story then no name is assigned".

create or replace function public.add_to_highlight(p_highlight uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; new_items jsonb;
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then raise exception 'Highlight not found.'; end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;
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

create or replace function public.remove_highlight_item(p_highlight uuid, p_item_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; remaining jsonb;
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then return jsonb_build_object('success', true); end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;

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
