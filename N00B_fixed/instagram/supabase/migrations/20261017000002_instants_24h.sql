-- NOOB - Instants live for 24 hours and are then deleted for good (the instant AND its picture on the server). Daily NOOB entries are already deleted when their day ends
-- (migration 20261016000005). Nothing else is touched: posts, reels, stories, videos, chats and pictures stay until the person deletes them. Nothing in NOOB deletes anything
-- after 30 days.
--
-- Safe to run again.

-- 1. The picture of a deleted instant leaves the server ten minutes after it (it was 24 hours).
drop trigger if exists trash_media_del_instants on public.instants;
create trigger trash_media_del_instants after delete on public.instants
  for each row execute function public.trash_replaced_media('10 minutes', 'media_url');

-- 2. Deletes every instant whose 24 hours are over (the people it was sent to and their reactions go with it, by cascade), and the "sent you an instant" notifications.
create or replace function public.purge_expired_instants() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  delete from public.notifications where type in ('instant', 'instant_reaction') and created_at < now() - interval '24 hours';
  with gone as (delete from public.instants where expires_at <= now() returning 1)
  select count(*)::integer into n from gone;
  return coalesce(n, 0);
end;
$$;
revoke execute on function public.purge_expired_instants() from public, anon, authenticated;

-- 3. The app's start-up nudge (at most once every 10 minutes for the whole app) now also deletes finished Instants.
create or replace function public.poke_media_cleanup() returns void
language plpgsql security definer set search_path = public as $$
declare last_at timestamptz;
begin
  begin
    select value::timestamptz into last_at from public.internal_config where key = 'media_purge_kicked_at';
  exception when others then last_at := null;
  end;
  if last_at is not null and last_at > now() - interval '10 minutes' then return; end if;
  insert into public.internal_config (key, value) values ('media_purge_kicked_at', now()::text)
    on conflict (key) do update set value = excluded.value;
  perform public.settle_past_daily_challenges();
  perform public.purge_expired_instants();
  perform public.kick_media_purge();
exception when others then
  null;
end;
$$;
revoke execute on function public.poke_media_cleanup() from public, anon;
grant execute on function public.poke_media_cleanup() to authenticated;

-- 4. "Your Instants" shows only the ones that are still alive (it used to show a year of them).
create or replace function public.my_instants_archive(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'mediaUrl', i.media_url, 'caption', i.caption, 'audience', i.audience,
      'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'sentTo', (select count(*) from public.instant_recipients r where r.instant_id = i.id),
      'reactions', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'emoji', r.reaction) order by r.reacted_at)
                             from public.instant_recipients r join public.profiles p on p.id = r.user_id
                             where r.instant_id = i.id and r.reaction is not null), '[]'::jsonb))
      order by i.created_at desc)
    from (select * from public.instants where user_id = me and expires_at > now()
          order by created_at desc limit least(greatest(p_limit, 1), 500)) i), '[]'::jsonb);
end;
$$;
revoke execute on function public.my_instants_archive(int) from public, anon;
grant execute on function public.my_instants_archive(int) to authenticated;

-- 5. Where the database can run scheduled jobs, do it every 10 minutes (the app also does it whenever it is opened).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-instants-purge', '*/10 * * * *', $job$ select public.purge_expired_instants(); select public.kick_media_purge(); $job$);
  end if;
exception when others then
  raise notice 'The Instants cleanup job was not scheduled: %', sqlerrm;
end
$$;

-- 6. Clear the ones that are already past their 24 hours.
select public.purge_expired_instants();
