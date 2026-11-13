-- Admin panel -> Content tab: browse EVERYTHING, page by page.
--
-- Why: the tab asked admin_content_feed / admin_content_videos / admin_content_instants for the newest 60 items and those functions never
-- return more than 200, so on a platform with more posts than that the rest of the posts, reels, videos, stories and instants were
-- simply unreachable ("it is not loading all posts").
--
-- What: one new function, admin_content_page, for all five kinds. It returns one page at a time plus the real total:
--     { success, items, total, hasMore, nextAt, nextId }
-- "Load more" sends nextAt / nextId back as p_before_at / p_before_id (a keyset cursor on (created_at, id), the same idea as feed_posts_page),
-- so pages never skip or repeat a row, even when several rows share the same timestamp.
--
-- Who sees what: exactly what the old admin content browser showed - EVERY row of the table, with no feed rules applied (private and
-- suspended accounts, archived and scheduled posts, expired stories, all of it). Only the main NOOB administrator can call it (the same
-- is_master_admin() check the old functions used); signed-in members get "Access denied", signed-out callers get "permission denied".
-- Normal users' feeds are not touched. The three old functions stay as they were (older app versions keep working).
-- nextAt / nextId are null on the last page.
-- Page size: 1..100 (default 60). Changes no data. Safe to run twice.

create or replace function public.admin_content_page(
  p_type text,
  p_limit integer default 60,
  p_before_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 60), 1), 100);
  v_rows jsonb;
  v_total bigint;
  v_has boolean;
  v_last jsonb;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;

  if p_type = 'posts' then
    select count(*) into v_total from public.posts;
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'j', public.post_json(x.r)) order by x.created_at desc, x.id desc) into v_rows
    from (select r.id, r.created_at, r from public.posts r
          where p_before_at is null or r.created_at < p_before_at or (r.created_at = p_before_at and p_before_id is not null and r.id < p_before_id)
          order by r.created_at desc, r.id desc limit v_lim + 1) x;
  elsif p_type = 'reels' then
    select count(*) into v_total from public.reels;
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'j', public.reel_json(x.r)) order by x.created_at desc, x.id desc) into v_rows
    from (select r.id, r.created_at, r from public.reels r
          where p_before_at is null or r.created_at < p_before_at or (r.created_at = p_before_at and p_before_id is not null and r.id < p_before_id)
          order by r.created_at desc, r.id desc limit v_lim + 1) x;
  elsif p_type = 'stories' then
    select count(*) into v_total from public.stories;
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'j', public.story_json(x.r)) order by x.created_at desc, x.id desc) into v_rows
    from (select r.id, r.created_at, r from public.stories r
          where p_before_at is null or r.created_at < p_before_at or (r.created_at = p_before_at and p_before_id is not null and r.id < p_before_id)
          order by r.created_at desc, r.id desc limit v_lim + 1) x;
  elsif p_type = 'videos' then
    select count(*) into v_total from public.long_videos;
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'j', public.long_video_json(x.r)) order by x.created_at desc, x.id desc) into v_rows
    from (select r.id, r.created_at, r from public.long_videos r
          where p_before_at is null or r.created_at < p_before_at or (r.created_at = p_before_at and p_before_id is not null and r.id < p_before_id)
          order by r.created_at desc, r.id desc limit v_lim + 1) x;
  elsif p_type = 'instants' then
    select count(*) into v_total from public.instants;
    select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'j', jsonb_build_object(
        'id', x.id, 'userId', x.user_id, 'username', x.username, 'userAvatar', x.avatar, 'isVerified', x.is_verified,
        'mediaUrl', x.media_url, 'mediaType', 'image', 'caption', x.caption, 'audience', x.audience,
        'createdAt', x.created_at, 'expiresAt', x.expires_at,
        'sentTo', (select count(*) from public.instant_recipients ir where ir.instant_id = x.id))) order by x.created_at desc, x.id desc) into v_rows
    from (select i.id, i.user_id, i.media_url, i.caption, i.audience, i.created_at, i.expires_at, p.username, p.avatar, p.is_verified
          from public.instants i left join public.profiles p on p.id = i.user_id
          where p_before_at is null or i.created_at < p_before_at or (i.created_at = p_before_at and p_before_id is not null and i.id < p_before_id)
          order by i.created_at desc, i.id desc limit v_lim + 1) x;
  else
    raise exception 'Unknown content type.';
  end if;

  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_has := jsonb_array_length(v_rows) > v_lim;
  if v_has then v_rows := v_rows - v_lim; end if;     -- drop the one extra row that only told us there is more
  v_last := case when v_has and jsonb_array_length(v_rows) > 0 then v_rows -> (jsonb_array_length(v_rows) - 1) else null end;

  return jsonb_build_object(
    'success', true,
    'items', coalesce((select jsonb_agg(e.v -> 'j' order by e.n) from jsonb_array_elements(v_rows) with ordinality as e(v, n)), '[]'::jsonb),
    'total', v_total,
    'hasMore', v_has,
    'nextAt', v_last ->> 'at',
    'nextId', v_last ->> 'id'
  );
end;
$$;

revoke execute on function public.admin_content_page(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.admin_content_page(text, integer, timestamptz, uuid) to authenticated, service_role;
