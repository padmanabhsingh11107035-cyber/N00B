-- NOOB Draw: tell people when their free spin comes back. When the free period resets (the 1st of the month, India time; or 7 days later if it is switched to
-- weekly), everybody who had used a free spin gets ONE notification in the app (and the phone notification every new notification already sends): "NOOB Draw is ready".
-- Never an email. Each reset is told once per person and pack, however often this runs. Safe to run more than once.

create table if not exists public.noob_draw_ready_sent (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  pack     text not null,
  ready_at timestamptz not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, pack, ready_at)
);
alter table public.noob_draw_ready_sent enable row level security;      -- no policy: only the job below uses it

create or replace function public.run_noob_draw_ready_notifications() returns integer
language plpgsql security definer set search_path = public as $$
declare per text; n integer := 0; r record; admin_id uuid := public.noob_admin_id();
begin
  per := coalesce((select value from public.noob_draw_config where key = 'free_period'), 'month');
  for r in
    with last_free as (
      -- only FREE spins count (a paid spin never uses up or brings back the free one)
      select s.user_id, s.pack, max(s.created_at) as last_at
      from public.noob_draw_spins s join public.noob_draw_packs pk on pk.id = s.pack
      where not s.paid group by s.user_id, s.pack
    ), due as (
      select lf.user_id, lf.pack,
             case when per = 'week' then lf.last_at + interval '7 days'
                  else (date_trunc('month', lf.last_at at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata' end as ready_at
      from last_free lf
    )
    select d.user_id, array_agg(d.pack order by d.pack) as packs, array_agg(d.ready_at order by d.pack) as readys
    from due d join public.profiles p on p.id = d.user_id
    where d.ready_at <= now()
      and d.ready_at > now() - interval '2 days'          -- a reset that just happened; never wake up old ones
      and not p.is_suspended and not p.is_ai
      and not exists (select 1 from public.noob_draw_ready_sent x where x.user_id = d.user_id and x.pack = d.pack and x.ready_at = d.ready_at)
    group by d.user_id
  loop
    insert into public.noob_draw_ready_sent (user_id, pack, ready_at)
    select r.user_id, k.pack, k.rd from unnest(r.packs, r.readys) as k(pack, rd) on conflict do nothing;
    perform public.notify_user(r.user_id, 'noob_draw_ready', admin_id,
      case when cardinality(r.packs) > 1
           then format('Your %s free NOOB Draw spins are back. Open NOOB Draw and spin to win Pro, the verified tick and millions of points.', cardinality(r.packs))
           else 'Your free NOOB Draw spin is back. Open NOOB Draw and spin to win Pro, the verified tick and millions of points.' end,
      '🎁 NOOB Draw is ready');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_noob_draw_ready_notifications() from public, anon, authenticated;

-- every 10 minutes (only where the pg_cron extension is available; otherwise skipped without failing)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-draw-ready', '*/10 * * * *', $job$ select public.run_noob_draw_ready_notifications(); $job$);
  end if;
exception when others then
  raise notice 'The NOOB Draw reminder job was not scheduled: %', sqlerrm;
end
$$;
