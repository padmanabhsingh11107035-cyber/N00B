-- Tappable hashtags + editing the caption of your own post / reel after publishing.
-- ADDITIVE ONLY: new functions only. No table, column or existing function is changed or dropped, and no existing row is touched when this runs.
-- (Editing a caption only ever happens later, when the owner presses Save, and only changes that one post's caption and hashtags.)
-- Safe to run more than once.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. The hashtag rule, in one place. A tag is "#" + letters / digits / underscore (1-50 of them, at least one letter), and the "#" must not
--    sit right after a letter, digit, "_", "/", "&" or another "#" (so a web address like site.com/page#section is not a tag).
--    Same rule as src/utils/hashtags.ts. Returned lower-case, with the "#" in front (the way the app already stores them), without repeats.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.extract_hashtags(p_text text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg('#' || t order by first_pos), '{}'::text[])
  from (
    select lower(x.m[2]) as t, min(x.ord) as first_pos
    from regexp_matches(coalesce(p_text, ''), '(^|[^[:alnum:]_/&#])#([[:alnum:]_]{1,50})', 'g') with ordinality as x(m, ord)
    where x.m[2] ~ '[[:alpha:]]'
    group by lower(x.m[2])
  ) s;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Posts and reels with a hashtag. Same visibility as post_by_id / reel_by_id: not archived, not scheduled for later, author not suspended / blocked /
--    hiding from you / private-without-follow (public.can_view_author), and your own posts always. Case-insensitive; "#tag" and "tag" are the same.
--    p_sort: 'new' (default, newest first) or 'top' (most liked first).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.posts_by_hashtag(p_tag text, p_limit integer default 60, p_offset integer default 0, p_sort text default 'new') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(regexp_replace(btrim(coalesce(p_tag, '')), '^#+', '')); result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' or length(t) > 60 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.post_json(x.po) order by x.rn), '[]'::jsonb) into result
  from (
    select po, row_number() over (order by case when p_sort = 'top' then po.likes_count end desc nulls last, po.created_at desc) as rn
    from public.posts po
    where not po.is_archived
      and (po.scheduled_for is null or po.scheduled_for <= now() or po.user_id = auth.uid())
      and exists (select 1 from unnest(po.hashtags) h where lower(regexp_replace(h, '^#+', '')) = t)
      and (po.user_id = auth.uid() or public.can_view_author(po.user_id))
    order by case when p_sort = 'top' then po.likes_count end desc nulls last, po.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return result;
end;
$$;

create or replace function public.reels_by_hashtag(p_tag text, p_limit integer default 60, p_offset integer default 0, p_sort text default 'new') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(regexp_replace(btrim(coalesce(p_tag, '')), '^#+', '')); result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' or length(t) > 60 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.reel_json(x.re) order by x.rn), '[]'::jsonb) into result
  from (
    select re, row_number() over (order by case when p_sort = 'top' then re.likes_count end desc nulls last, re.created_at desc) as rn
    from public.reels re
    where exists (select 1 from unnest(re.hashtags) h where lower(regexp_replace(h, '^#+', '')) = t)
      and (re.user_id = auth.uid() or public.can_view_author(re.user_id))
    order by case when p_sort = 'top' then re.likes_count end desc nulls last, re.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return result;
end;
$$;

-- How many posts and reels carry the tag (that this person may see): {"posts": n, "reels": n}
create or replace function public.hashtag_counts(p_tag text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(regexp_replace(btrim(coalesce(p_tag, '')), '^#+', '')); np integer; nr integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' or length(t) > 60 then return jsonb_build_object('posts', 0, 'reels', 0); end if;
  select count(*) into np from public.posts po
    where not po.is_archived
      and (po.scheduled_for is null or po.scheduled_for <= now() or po.user_id = auth.uid())
      and exists (select 1 from unnest(po.hashtags) h where lower(regexp_replace(h, '^#+', '')) = t)
      and (po.user_id = auth.uid() or public.can_view_author(po.user_id));
  select count(*) into nr from public.reels re
    where exists (select 1 from unnest(re.hashtags) h where lower(regexp_replace(h, '^#+', '')) = t)
      and (re.user_id = auth.uid() or public.can_view_author(re.user_id));
  return jsonb_build_object('posts', np, 'reels', nr);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Edit the caption of your own post / reel. Only the owner (nobody else, not even an administrator), at most 2200 characters (the limit of the post creator).
--    The hashtag list becomes: the tags found in the new caption, PLUS any tag that was added by hand in the "Add hashtags" box
--    (a tag that was not in the old caption is never dropped by an edit). Lower-case, no repeats, at most 30.
--    The AI moderator looks at the new caption by itself (its trigger on a changed caption already exists).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.update_post_caption(p_post uuid, p_caption text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); po public.posts; cap text := coalesce(p_caption, ''); old_tags text[]; manual text[]; merged text[];
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if char_length(cap) > 2200 then raise exception 'A caption can have at most 2200 characters.'; end if;
  select * into po from public.posts where id = p_post;
  if not found or po.user_id is distinct from me then raise exception 'You can only edit your own posts.' using errcode = '42501'; end if;
  old_tags := public.extract_hashtags(po.caption);
  select coalesce(array_agg(h), '{}'::text[]) into manual
    from unnest(po.hashtags) h
    where not (('#' || lower(regexp_replace(h, '^#+', ''))) = any (old_tags));
  select coalesce(array_agg(t), '{}'::text[]) into merged from (
    select t, min(o) as o from (
      select '#' || lower(regexp_replace(h, '^#+', '')) as t, ord as o from unnest(manual) with ordinality as a(h, ord)
      union all
      select h, 1000 + ord from unnest(public.extract_hashtags(cap)) with ordinality as b(h, ord)
    ) u where t <> '#' group by t order by min(o) limit 30
  ) z;
  update public.posts set caption = cap, hashtags = merged where id = p_post;
  return (select public.post_json(p) from public.posts p where p.id = p_post);
end;
$$;

create or replace function public.update_reel_caption(p_reel uuid, p_caption text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); re public.reels; cap text := coalesce(p_caption, ''); old_tags text[]; manual text[]; merged text[];
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if char_length(cap) > 2200 then raise exception 'A caption can have at most 2200 characters.'; end if;
  select * into re from public.reels where id = p_reel;
  if not found or re.user_id is distinct from me then raise exception 'You can only edit your own reels.' using errcode = '42501'; end if;
  old_tags := public.extract_hashtags(re.caption);
  select coalesce(array_agg(h), '{}'::text[]) into manual
    from unnest(re.hashtags) h
    where not (('#' || lower(regexp_replace(h, '^#+', ''))) = any (old_tags));
  select coalesce(array_agg(t), '{}'::text[]) into merged from (
    select t, min(o) as o from (
      select '#' || lower(regexp_replace(h, '^#+', '')) as t, ord as o from unnest(manual) with ordinality as a(h, ord)
      union all
      select h, 1000 + ord from unnest(public.extract_hashtags(cap)) with ordinality as b(h, ord)
    ) u where t <> '#' group by t order by min(o) limit 30
  ) z;
  update public.reels set caption = cap, hashtags = merged where id = p_reel;
  return (select public.reel_json(r) from public.reels r where r.id = p_reel);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Who may call them: signed-in people only
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.extract_hashtags(text) from public, anon;
revoke all on function public.posts_by_hashtag(text, integer, integer, text) from public, anon;
revoke all on function public.reels_by_hashtag(text, integer, integer, text) from public, anon;
revoke all on function public.hashtag_counts(text) from public, anon;
revoke all on function public.update_post_caption(uuid, text) from public, anon;
revoke all on function public.update_reel_caption(uuid, text) from public, anon;
grant execute on function public.extract_hashtags(text) to authenticated;
grant execute on function public.posts_by_hashtag(text, integer, integer, text) to authenticated;
grant execute on function public.reels_by_hashtag(text, integer, integer, text) to authenticated;
grant execute on function public.hashtag_counts(text) to authenticated;
grant execute on function public.update_post_caption(uuid, text) to authenticated;
grant execute on function public.update_reel_caption(uuid, text) to authenticated;

-- No index is added on purpose: the tag is matched case-insensitively and with or without "#", which a plain index on the list cannot serve,
-- and an index on every post is not worth the extra write cost at this size. If hashtag pages ever get slow, an expression index can be added later.
