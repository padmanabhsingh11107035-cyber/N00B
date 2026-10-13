-- "Our Team", part 3: the main NOOB administrator can pin team members to the top.
--
-- Pinned people come first on the page, so they get the numbers 01, 02 …, and everyone else follows. Only the administrator is ever told which
-- people are pinned (the flag is sent to nobody else), so general users just see the order, with no "pinned" mark. People are pinned in the order
-- they were pinned (the first one pinned is 01); the up/down arrows reorder within the pinned group and within the rest, never across.

alter table public.team_members add column if not exists pinned boolean not null default false;

-- The list: pinned first for everyone; the "pinned" flag itself only for the main administrator.
create or replace function public.team_json() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and (pr.is_admin or lower(pr.username) = 'noob') and not pr.is_suspended
    ) as is_main
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'qualification', t.qualification, 'description', t.description,
    'photo', t.photo, 'position', t.position,
    'pinned', t.pinned and me.is_main,
    'userId', t.user_id, 'username', p.username, 'avatar', p.avatar, 'isVerified', coalesce(p.is_verified, false),
    'isMe', t.user_id is not null and t.user_id = auth.uid(),
    'following', t.user_id is not null and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = t.user_id),
    'requested', t.user_id is not null and exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = t.user_id),
    'blocked', t.user_id is not null and exists (
      select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = t.user_id) or (b.blocker_id = t.user_id and b.blocked_id = auth.uid()))
  ) order by t.pinned desc, t.position, t.created_at, t.id), '[]'::jsonb)
  from public.team_members t
  cross join me
  left join public.profiles p on p.id = t.user_id;
$$;
revoke execute on function public.team_json() from public, anon, authenticated;

-- Makes "position" the number shown on the page again (pinned first, then the rest), 1, 2, 3 …. Internal.
create or replace function public.team_renumber() returns void
language sql security definer set search_path = public as $$
  update public.team_members t set position = u.n
  from (select id, row_number() over (order by pinned desc, position, created_at, id) as n from public.team_members) u
  where t.id = u.id and t.position is distinct from u.n;
$$;
revoke execute on function public.team_renumber() from public, anon, authenticated;

-- Pin or unpin. A newly pinned person goes behind the ones already pinned; an unpinned one goes to the top of the rest. Returns the fresh list.
create or replace function public.admin_team_pin(p_id uuid, p_pinned boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.team_members; want boolean := coalesce(p_pinned, true);
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  select * into m from public.team_members where id = p_id for update;
  if not found then raise exception 'That team member no longer exists.'; end if;
  if m.pinned is distinct from want then
    -- a newly pinned person is placed right behind the people already pinned; an unpinned one right in front of the rest
    update public.team_members set pinned = want,
      position = case when want then coalesce((select max(position) from public.team_members where pinned), 0) + 1 else coalesce((select min(position) from public.team_members where not pinned and id <> p_id), 1) - 1 end,
      updated_at = now()
    where id = p_id;
    -- positions can now tie or go below 1: settle them as 1, 2, 3 … in the order shown
    perform public.team_renumber();
    perform public.log_admin_action(case when want then 'team_member_pinned' else 'team_member_unpinned' end, m.user_id, jsonb_build_object('name', m.name));
  end if;
  return jsonb_build_object('success', true, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_pin(uuid, boolean) from public, anon;
grant execute on function public.admin_team_pin(uuid, boolean) to authenticated;

-- Reordering stays inside the group (pinned / the rest): an arrow never moves someone across the line.
create or replace function public.admin_team_move(p_id uuid, p_direction text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; i int; j int; tmp uuid;
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  select array_agg(id order by pinned desc, position, created_at, id) into ids from public.team_members;
  i := array_position(ids, p_id);
  if i is null then raise exception 'That team member no longer exists.'; end if;
  j := case lower(coalesce(p_direction, '')) when 'up' then i - 1 when 'down' then i + 1 else null end;
  if j is null then raise exception 'The direction must be up or down.'; end if;
  if j >= 1 and j <= array_length(ids, 1)
     and (select pinned from public.team_members where id = ids[i]) = (select pinned from public.team_members where id = ids[j]) then
    tmp := ids[i]; ids[i] := ids[j]; ids[j] := tmp;
    update public.team_members t set position = u.n
    from unnest(ids) with ordinality as u(id, n)
    where t.id = u.id;
    perform public.log_admin_action('team_member_moved', null, jsonb_build_object('name', (select name from public.team_members where id = p_id), 'direction', lower(p_direction)));
  end if;
  return jsonb_build_object('success', true, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_move(uuid, text) from public, anon;
grant execute on function public.admin_team_move(uuid, text) to authenticated;

-- Removing someone closes the gap in the numbers (pinned first), same as before.
create or replace function public.team_erase(p_member uuid, p_application uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare m public.team_members; a public.team_page_applications; uid uuid; nm text; keys text[];
begin
  if p_member is not null then select * into m from public.team_members where id = p_member for update; end if;
  if p_application is not null then select * into a from public.team_page_applications where id = p_application for update; end if;
  uid := coalesce(m.user_id, a.user_id);
  if m.id is null and uid is not null then select * into m from public.team_members where user_id = uid for update; end if;
  if a.id is null and uid is not null then select * into a from public.team_page_applications where user_id = uid for update; end if;
  if m.id is null and a.id is null then raise exception 'That team member no longer exists.'; end if;
  nm := coalesce(m.name, a.name);
  select coalesce(array_agg(distinct k), '{}') into keys from unnest(array[m.photo, a.photo]) as k where k is not null;

  if m.id is not null then delete from public.team_members where id = m.id; end if;
  if a.id is not null then delete from public.team_page_applications where id = a.id; end if;
  perform public.team_renumber();

  update public.admin_audit_log set details = coalesce(details, '{}'::jsonb) - 'name'
  where action like 'team\_%' and ((uid is not null and target_id = uid) or details->>'name' = nm);
  perform public.log_admin_action('team_member_removed', uid, '{}'::jsonb);
  return keys;
end;
$$;
revoke execute on function public.team_erase(uuid, uuid) from public, anon, authenticated;
