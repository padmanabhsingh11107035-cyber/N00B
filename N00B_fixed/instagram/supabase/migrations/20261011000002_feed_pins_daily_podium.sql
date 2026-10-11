-- 1. The NOOB admin can PIN a post, a reel or a video to the top of everyone's Feed page.
--    Up to 5 pins at once (so the top of the feed never becomes a wall). Anyone can read which items are pinned; only an admin can
--    change it. What each person sees of a pinned item still follows the normal rules (a private account's post, a blocked person's
--    video... never shows up for someone who may not see it), because the item itself is read with that person's own permissions.
-- 2. Daily NOOB remembers the whole podium (1st, 2nd and 3rd), not only the winner, so the Hall of Fame can show all three.

-- ---------------------------------------------------------------------------------------------------------- 1. pins
create table if not exists public.pinned_feed_items (
  kind      text not null check (kind in ('post', 'reel', 'video')),
  item_id   uuid not null,
  pinned_by uuid references public.profiles (id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (kind, item_id)
);
alter table public.pinned_feed_items enable row level security;
drop policy if exists pinned_feed_items_select on public.pinned_feed_items;
create policy pinned_feed_items_select on public.pinned_feed_items for select to authenticated using (true);
revoke all on public.pinned_feed_items from anon, authenticated;
grant select on public.pinned_feed_items to authenticated;

create or replace function public.admin_set_feed_pin(p_kind text, p_item uuid, p_pinned boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare found_item boolean;
begin
  if not public.is_admin() then raise exception 'Only the NOOB admin can pin content to the Feed.' using errcode = '42501'; end if;
  if p_kind not in ('post', 'reel', 'video') then raise exception 'Unknown kind of content.'; end if;
  if p_item is null then raise exception 'Choose something to pin.'; end if;

  if not coalesce(p_pinned, false) then
    delete from public.pinned_feed_items where kind = p_kind and item_id = p_item;
    return jsonb_build_object('success', true, 'pinned', false);
  end if;

  found_item := case p_kind
    when 'post'  then exists (select 1 from public.posts p where p.id = p_item and not p.is_archived)
    when 'reel'  then exists (select 1 from public.reels r where r.id = p_item)
    else              exists (select 1 from public.long_videos v where v.id = p_item) end;
  if not found_item then raise exception 'That content was not found (it may have been deleted or archived).'; end if;

  if not exists (select 1 from public.pinned_feed_items where kind = p_kind and item_id = p_item)
     and (select count(*) from public.pinned_feed_items) >= 5 then
    raise exception 'You can pin up to 5 items at a time. Unpin one first.';
  end if;

  insert into public.pinned_feed_items (kind, item_id, pinned_by) values (p_kind, p_item, auth.uid())
  on conflict (kind, item_id) do update set pinned_by = excluded.pinned_by, pinned_at = now();
  return jsonb_build_object('success', true, 'pinned', true);
end;
$$;
revoke execute on function public.admin_set_feed_pin(text, uuid, boolean) from public, anon;
grant execute on function public.admin_set_feed_pin(text, uuid, boolean) to authenticated;

-- Runs with the caller's own permissions (no security definer), so every item is filtered exactly like the normal feeds.
create or replace function public.pinned_feed_items() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'itemId', x.item_id, 'pinnedAt', x.pinned_at,
                                               'post', x.post_j, 'reel', x.reel_j, 'video', x.video_j) order by x.pinned_at desc), '[]'::jsonb)
  from (
    select pi.kind, pi.item_id, pi.pinned_at,
      case when pi.kind = 'post'  then (select public.post_json(p) from public.posts p where p.id = pi.item_id and not p.is_archived) end as post_j,
      case when pi.kind = 'reel'  then (select public.reel_json(r) from public.reels r where r.id = pi.item_id) end as reel_j,
      case when pi.kind = 'video' then (select public.long_video_json(v) from public.long_videos v where v.id = pi.item_id and public.can_view_author(v.user_id)) end as video_j
    from public.pinned_feed_items pi
  ) x
  where coalesce(x.post_j, x.reel_j, x.video_j) is not null;
$$;
revoke execute on function public.pinned_feed_items() from public, anon;
grant execute on function public.pinned_feed_items() to authenticated;

-- ------------------------------------------------------------------------------------------ 2. Daily NOOB podium
alter table public.daily_challenge_settlements
  add column if not exists second_id    uuid references public.profiles (id) on delete set null,
  add column if not exists second_votes integer,
  add column if not exists third_id     uuid references public.profiles (id) on delete set null,
  add column if not exists third_votes  integer;

-- Same payout as before (10,000 / 5,000 / 2,500 points to the top three with at least one vote); now it also writes down who came 2nd and 3rd.
create or replace function public.settle_past_daily_challenges() returns text[]
language plpgsql security definer set search_path = public as $$
declare d record; top record; rank integer; purged text[] := '{}'; day_keys text[];
        w1 uuid; v1 integer; w2 uuid; v2 integer; w3 uuid; v3 integer;
begin
  for d in
    select dc.challenge_date from public.daily_challenges dc
    where dc.challenge_date < current_date
      and not exists (select 1 from public.daily_challenge_settlements s where s.challenge_date = dc.challenge_date)
  loop
    rank := 0; w1 := null; v1 := null; w2 := null; v2 := null; w3 := null; v3 := null;
    for top in
      select e.id, e.user_id, e.votes_count from public.daily_challenge_entries e
      where e.challenge_date = d.challenge_date and e.votes_count > 0
      order by e.votes_count desc, e.created_at asc
      limit 3
    loop
      rank := rank + 1;
      perform public.award_points(top.user_id, case rank when 1 then 10000 when 2 then 5000 else 2500 end,
        'Daily NOOB — #' || rank || ' place (' || d.challenge_date || ')');
      if rank = 1 then w1 := top.user_id; v1 := top.votes_count;
      elsif rank = 2 then w2 := top.user_id; v2 := top.votes_count;
      else w3 := top.user_id; v3 := top.votes_count; end if;
    end loop;
    insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes, second_id, second_votes, third_id, third_votes)
      values (d.challenge_date, w1, v1, w2, v2, w3, v3)
    on conflict (challenge_date) do nothing;

    select coalesce(array_agg(media_url), '{}') into day_keys
      from public.daily_challenge_entries where challenge_date = d.challenge_date;
    purged := purged || day_keys;
    delete from public.daily_challenge_entries where challenge_date = d.challenge_date;
  end loop;
  return purged;
end;
$$;

-- The admin's hand-picked winners are remembered the same way.
create or replace function public.admin_assign_daily_challenge_winners(p_date date, p_first uuid, p_second uuid default null, p_third uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare first_votes integer; second_votes integer; third_votes integer; purged text[];
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if p_first is null then raise exception 'Pick at least a 1st place.'; end if;
  if p_second is not null and p_second = p_first then raise exception 'The same person cannot take two places.'; end if;
  if p_third is not null and (p_third = p_first or p_third = p_second) then raise exception 'The same person cannot take two places.'; end if;
  if exists (select 1 from public.daily_challenge_settlements where challenge_date = p_date) then
    raise exception 'That day has already been settled.';
  end if;
  if not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_first) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;
  if p_second is not null and not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_second) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;
  if p_third is not null and not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_third) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;

  select votes_count into first_votes from public.daily_challenge_entries where challenge_date = p_date and user_id = p_first;
  select votes_count into second_votes from public.daily_challenge_entries where challenge_date = p_date and user_id = p_second;
  select votes_count into third_votes from public.daily_challenge_entries where challenge_date = p_date and user_id = p_third;
  perform public.award_points(p_first, 10000, 'Daily NOOB — #1 place (' || p_date || ', admin-assigned)');
  if p_second is not null then
    perform public.award_points(p_second, 5000, 'Daily NOOB — #2 place (' || p_date || ', admin-assigned)');
  end if;
  if p_third is not null then
    perform public.award_points(p_third, 2500, 'Daily NOOB — #3 place (' || p_date || ', admin-assigned)');
  end if;

  insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes, second_id, second_votes, third_id, third_votes)
    values (p_date, p_first, coalesce(first_votes, 0), p_second, case when p_second is null then null else coalesce(second_votes, 0) end,
            p_third, case when p_third is null then null else coalesce(third_votes, 0) end);

  select coalesce(array_agg(media_url), '{}') into purged from public.daily_challenge_entries where challenge_date = p_date;
  delete from public.daily_challenge_entries where challenge_date = p_date;
  return jsonb_build_object('success', true, 'purgedMediaKeys', coalesce(to_jsonb(purged), '[]'::jsonb));
end;
$$;
grant execute on function public.admin_assign_daily_challenge_winners(date, uuid, uuid, uuid) to authenticated;

-- Same list as before (one row per day with the winner), plus the whole podium of that day.
create or replace function public.fetch_daily_champions(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'challengeDate', x.challenge_date, 'userId', x.winner_id, 'username', x.username, 'userAvatar', x.avatar,
    'isVerified', x.is_verified, 'votesCount', x.winner_votes, 'prompt', x.prompt,
    'podium', (
      select coalesce(jsonb_agg(jsonb_build_object('rank', t.rk, 'userId', t.uid, 'username', pp.username, 'userAvatar', pp.avatar,
                                                   'isVerified', pp.is_verified, 'votesCount', t.votes) order by t.rk), '[]'::jsonb)
      from (values (1, x.winner_id, x.winner_votes), (2, x.second_id, x.second_votes), (3, x.third_id, x.third_votes)) as t(rk, uid, votes)
      join public.profiles pp on pp.id = t.uid
      where t.uid is not null)
  ) order by x.challenge_date desc), '[]'::jsonb)
  from (
    select s.challenge_date, s.winner_id, s.winner_votes, s.second_id, s.second_votes, s.third_id, s.third_votes,
      a.username, a.avatar, a.is_verified,
      coalesce(dc.custom_prompt, (select prompt from public.daily_challenge_prompts where id = dc.prompt_id)) as prompt
    from public.daily_challenge_settlements s
    join public.daily_challenges dc on dc.challenge_date = s.challenge_date
    join public.profiles a on a.id = s.winner_id
    where s.winner_id is not null
    order by s.challenge_date desc
    limit least(greatest(p_limit, 1), 100)
  ) x;
$$;
grant execute on function public.fetch_daily_champions(integer) to authenticated;
