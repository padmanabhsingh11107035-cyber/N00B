-- NOOB — the "Notify me" story sticker. The creator writes a title and picks a time; people who watch the story tap "Notify me" and get a notification when that time comes.
-- A reminder is kept even after the 24-hour story is gone (it is only a row with the title and the time).

create table if not exists public.story_reminders (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid not null,
  sticker_index int  not null check (sticker_index between 0 and 49),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  remind_at     timestamptz not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (story_id, sticker_index, user_id)
);
create index if not exists story_reminders_due_idx on public.story_reminders (remind_at) where sent_at is null;
create index if not exists story_reminders_user_idx on public.story_reminders (user_id);
create index if not exists story_reminders_owner_idx on public.story_reminders (owner_id);
alter table public.story_reminders enable row level security;
revoke all on public.story_reminders from anon, authenticated;

-- Who tapped "Notify me" on each notify sticker of one story: {"2": {"mine": true, "count": 14}}. Anyone who may see the story gets "mine"; the count is for everyone too.
create or replace function public.story_notify_status(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; res jsonb := '{}'::jsonb; i int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null or jsonb_typeof(st) <> 'array' then return res; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  for i in 0 .. least(jsonb_array_length(st), 50) - 1 loop
    if st -> i ->> 'type' = 'notify' then
      res := res || jsonb_build_object(i::text, jsonb_build_object(
        'mine', exists (select 1 from public.story_reminders r where r.story_id = p_story and r.sticker_index = i and r.user_id = me),
        'count', (select count(*) from public.story_reminders r where r.story_id = p_story and r.sticker_index = i)));
    end if;
  end loop;
  return res;
end;
$$;
revoke execute on function public.story_notify_status(uuid) from public, anon;
grant execute on function public.story_notify_status(uuid) to authenticated;

-- Tap "Notify me" (p_on = true) or tap again to cancel (false).
create or replace function public.story_notify_toggle(p_story uuid, p_sticker int, p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; sk jsonb; at_ts timestamptz; ttl text; pending int; total int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  if jsonb_typeof(st) <> 'array' or p_sticker is null or p_sticker < 0 or p_sticker >= jsonb_array_length(st) then raise exception 'This reminder was not found.'; end if;
  sk := st -> p_sticker;
  if sk ->> 'type' <> 'notify' then raise exception 'This reminder was not found.'; end if;

  if coalesce(p_on, true) then
    begin at_ts := (sk -> 'data' ->> 'whenIso')::timestamptz; exception when others then at_ts := null; end;
    if at_ts is null then raise exception 'This reminder has no time.'; end if;
    if at_ts <= now() then raise exception 'This time has already passed.'; end if;
    select count(*) into pending from public.story_reminders where user_id = me and sent_at is null;
    if pending >= 200 then raise exception 'You already have 200 reminders waiting.'; end if;
    ttl := left(btrim(coalesce(sk -> 'data' ->> 'title', 'Reminder')), 120);
    if ttl = '' then ttl := 'Reminder'; end if;
    insert into public.story_reminders (story_id, sticker_index, user_id, owner_id, title, remind_at)
    values (p_story, p_sticker, me, owner, ttl, at_ts)
    on conflict (story_id, sticker_index, user_id) do nothing;
  else
    delete from public.story_reminders where story_id = p_story and sticker_index = p_sticker and user_id = me and sent_at is null;
  end if;
  select count(*) into total from public.story_reminders where story_id = p_story and sticker_index = p_sticker;
  return jsonb_build_object('success', true, 'mine', coalesce(p_on, true), 'count', total);
end;
$$;
revoke execute on function public.story_notify_toggle(uuid, int, boolean) from public, anon;
grant execute on function public.story_notify_toggle(uuid, int, boolean) to authenticated;

-- Runs every 5 minutes: sends the notifications that are due, and clears old rows.
create or replace function public.run_story_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; owner_name text;
begin
  for r in select * from public.story_reminders where sent_at is null and remind_at <= now() order by remind_at limit 500 for update skip locked loop
    select coalesce(nullif(display_name, ''), username) into owner_name from public.profiles where id = r.owner_id;
    perform public.notify_user(r.user_id, 'story_reminder', r.owner_id, r.title || ' (from ' || coalesce(owner_name, 'NOOB') || ')', '🔔 It is time!');
    update public.story_reminders set sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  delete from public.story_reminders where sent_at is not null and sent_at < now() - interval '7 days';
  return n;
end;
$$;
revoke execute on function public.run_story_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-story-reminders', '*/5 * * * *', $job$ select public.run_story_reminders(); $job$);
  end if;
exception when others then
  raise notice 'The story reminder job was not scheduled: %', sqlerrm;
end
$$;
