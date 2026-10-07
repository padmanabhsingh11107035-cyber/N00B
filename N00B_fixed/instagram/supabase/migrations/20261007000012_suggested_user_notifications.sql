-- "Suggested for you" — randomly surfaces one other account to follow, twice a day, as a
-- notification with inline Follow / Reject buttons. Reuses the existing notifications table and
-- action_status flow already used for follow requests (see accept_follow_request/decline_follow_request)
-- rather than inventing a separate mechanism.

create or replace function public.generate_suggested_user_notifications() returns void
language plpgsql security definer set search_path = public as $$
declare
  u record;
  candidate uuid;
begin
  for u in select id from public.profiles where not is_suspended and not is_ai loop
    -- Don't pile a second suggestion on top of one they haven't responded to yet.
    if exists (
      select 1 from public.notifications
      where target_user_id = u.id and type = 'suggested_user' and action_status = 'pending'
    ) then
      continue;
    end if;

    select p.id into candidate
    from public.profiles p
    where p.id <> u.id
      and not p.is_suspended
      and not p.is_ai
      and not exists (select 1 from public.follows f where f.follower_id = u.id and f.followee_id = p.id)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = u.id and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = u.id)
      )
      and not exists (
        -- Don't re-suggest the same person again too soon after a past suggestion.
        select 1 from public.notifications n
        where n.target_user_id = u.id and n.type = 'suggested_user' and n.actor_id = p.id
          and n.created_at > now() - interval '30 days'
      )
    order by random()
    limit 1;

    if candidate is not null then
      perform public.notify_user(u.id, 'suggested_user', candidate, 'Suggested for you', 'Suggested for you', null, null, null, 'pending');
    end if;
  end loop;
end;
$$;

-- Follow / reject one of these suggestions. Routes "follow" through toggle_follow itself so a
-- private suggested account correctly gets a follow REQUEST (and every other existing follow
-- rule — blocks, self-follow, suspension) instead of re-implementing any of that here.
create or replace function public.respond_suggested_user(p_notif_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n public.notifications;
  follow_result jsonb;
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select * into n from public.notifications
    where id = p_notif_id and target_user_id = me and type = 'suggested_user' and action_status = 'pending';
  if not found then raise exception 'That suggestion is no longer available.'; end if;

  if p_accept then
    follow_result := public.toggle_follow(n.actor_id);
  end if;

  update public.notifications set action_status = case when p_accept then 'accepted' else 'declined' end
    where id = p_notif_id;

  return jsonb_build_object('success', true, 'follow', follow_result);
end;
$$;
grant execute on function public.respond_suggested_user(uuid, boolean) to authenticated;

-- Run once right now so today's batch goes out immediately, then twice a day going forward.
select public.generate_suggested_user_notifications();

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-suggested-users', '0 9,21 * * *', $job$ select public.generate_suggested_user_notifications(); $job$);
  end if;
exception when others then
  raise notice 'Suggested-user job was not scheduled: %', sqlerrm;
end
$$;

select public._cron_status() as result;
