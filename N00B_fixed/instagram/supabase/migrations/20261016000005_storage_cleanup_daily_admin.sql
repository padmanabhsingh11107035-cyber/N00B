-- Nothing may sit on the server using space for no reason.
--
-- Why this exists: a file (a profile picture, a Daily NOOB entry, a post's picture...) is stored in the "media" bucket, and the row that points to it lives in the database.
-- Deleting or replacing the row never deleted the file, and the app could not do it either: storage only lets a person delete THEIR OWN files, so when Daily NOOB wiped a day, the
-- files of everyone but the person who happened to open the page stayed on the server for ever. A changed profile picture left the old one behind, and so did every deleted post.
--
-- What this does:
--  1. A deletion queue (media_trash). The moment a row that points to a file is deleted, or its picture is replaced, the OLD file is written down in the queue - by the
--     database itself, so no phone has to be online or allowed to do it.
--  2. The queue is emptied on the server (the Edge Function "purge_media", which may delete any file), every 10 minutes, and when the app is used. Before a file is removed the
--     database checks ONE MORE TIME that no row anywhere still points to it; if one does, the file is kept and the request is dropped. Nothing used by anything is ever deleted.
--  3. Files that were already left behind before this existed can be found and removed from the admin panel (Storage tab): a scan lists the files nothing points to, and
--     queues them for deletion in 24 hours (cancel any time).
--  4. Daily NOOB: a finished day is settled and wiped by itself at the end of the day (a nightly job, and whenever the app is used), including any entry left over.
--  5. Admin pages for Daily NOOB (entries shown automatically) and for Storage.
--
-- Safe to run more than once.

-- ====================================================================================================================================== 1. the queue
create table if not exists public.media_trash (
  key          text primary key,                       -- the file's name in the "media" bucket, e.g. avatars/1760000000000-ab12cd3.jpg
  reason       text not null default '',
  queued_at    timestamptz not null default now(),
  delete_after timestamptz not null default now(),     -- nothing is removed before this moment (a grace period, and a chance to cancel)
  attempts     integer not null default 0,
  last_error   text
);
alter table public.media_trash enable row level security;
revoke all on public.media_trash from anon, authenticated;     -- only the functions below touch it

-- A stored picture address -> the file's name in the bucket, or null when it is not one of our files (an outside link, a built-in picture, a base64 string, an unfinished upload).
-- Only one folder level deep, exactly how the app names its uploads, so a surprising value can never point at something else.
create or replace function public.media_key_of(p_value text) returns text
language plpgsql immutable set search_path = public as $$
declare v text := btrim(coalesce(p_value, ''));
begin
  if v = '' or v ~* '^(data|blob):' or v like 'pending:%' then return null; end if;
  v := regexp_replace(v, '^https?://[^/]+/(storage/v1/object/public/media/|media/)', '');
  v := regexp_replace(v, '^/?media/', '');
  v := regexp_replace(v, '^/', '');
  v := regexp_replace(v, '[?#].*$', '');
  if v ~ '^(posts|reels|stories|avatars|music|covers|stickers|products|chat|instants|comments|videos|daily|songs|team)/[A-Za-z0-9._~@+=-]+$' then return v; end if;
  return null;
end;
$$;

create or replace function public.queue_media_trash(p_value text, p_reason text, p_delay interval default interval '24 hours') returns void
language plpgsql security definer set search_path = public as $$
declare k text := public.media_key_of(p_value);
begin
  if k is null then return; end if;
  insert into public.media_trash (key, reason, delete_after)
    values (k, left(coalesce(p_reason, ''), 60), now() + coalesce(p_delay, interval '24 hours'))
  on conflict (key) do update
    set delete_after = least(public.media_trash.delete_after, excluded.delete_after), reason = excluded.reason;
exception when others then
  null;   -- writing this down must never stop the real action
end;
$$;
revoke execute on function public.queue_media_trash(text, text, interval) from public, anon, authenticated;

-- Trigger: the OLD file of a deleted row, or of a picture that was replaced, goes into the queue.
-- Arguments: the grace period, then the names of the columns that hold pictures.
create or replace function public.trash_replaced_media() returns trigger
language plpgsql security definer set search_path = public as $$
declare i integer; col text; o text; n text; delay interval := coalesce(nullif(tg_argv[0], '')::interval, interval '24 hours');
begin
  for i in 1 .. tg_nargs - 1 loop
    col := tg_argv[i];
    o := to_jsonb(old) ->> col;
    if o is null then continue; end if;
    if tg_op = 'DELETE' then
      perform public.queue_media_trash(o, tg_table_name || '.' || col, delay);
    else
      n := to_jsonb(new) ->> col;
      if n is distinct from o then perform public.queue_media_trash(o, tg_table_name || '.' || col, delay); end if;
    end if;
  end loop;
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function public.trash_replaced_media() from public, anon, authenticated;

-- Which tables hold pictures, and for how long a removed one waits before it is deleted from the server:
--   profile pictures and group pictures: 1 hour (the old one may still be on a screen); Daily NOOB entries: 10 minutes; everything else: 24 hours.
do $$
declare t record; cols text[]; args text;
begin
  for t in select * from (values
    ('profiles',              array['avatar', 'live_avatar_video_url'],      '1 hour',     true),
    ('chats',                 array['avatar'],                               '1 hour',     true),
    ('daily_challenge_entries', array['media_url'],                          '10 minutes', false),
    ('post_slides',           array['media_url'],                            '24 hours',   true),
    ('reels',                 array['video_url', 'thumbnail_url', 'audio_url', 'audio_cover_url'], '24 hours', true),
    ('stories',               array['media_url'],                            '24 hours',   false),
    ('long_videos',           array['video_url', 'thumbnail_url'],           '24 hours',   true),
    ('comments',              array['media_url'],                            '24 hours',   false),
    ('messages',              array['media_url'],                            '24 hours',   false),
    ('instants',              array['media_url'],                            '24 hours',   false),
    ('highlights',            array['cover_url'],                            '24 hours',   true),
    ('noob_room_chat',        array['media_url'],                            '24 hours',   false),
    ('music_tracks',          array['audio_url', 'cover_url'],               '1 hour',     true),
    ('team_members',          array['photo'],                                '24 hours',   true)
  ) as x(tbl, picture_cols, delay, on_update) loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    select array_agg(c.column_name::text) into cols
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name::text = any (t.picture_cols);
    if cols is null then continue; end if;
    select string_agg(quote_literal(x), ', ') into args from unnest(cols) x;
    execute format('drop trigger if exists %I on public.%I', 'trash_media_del_' || t.tbl, t.tbl);
    execute format('create trigger %I after delete on public.%I for each row execute function public.trash_replaced_media(%L, %s)',
                   'trash_media_del_' || t.tbl, t.tbl, t.delay, args);
    execute format('drop trigger if exists %I on public.%I', 'trash_media_upd_' || t.tbl, t.tbl);
    if t.on_update then
      execute format('create trigger %I after update of %s on public.%I for each row execute function public.trash_replaced_media(%L, %s)',
                     'trash_media_upd_' || t.tbl, array_to_string(cols, ', '), t.tbl, t.delay, args);
    end if;
  end loop;
end
$$;

-- ====================================================================================================================================== 2. "is anything still using this file?"
-- Looks in EVERY text / json column of EVERY table in the app (so a table added later is covered too), and answers which of the given files are still pointed to.
create or replace function public.media_in_use(p_keys text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare c record; remaining text[] := coalesce(p_keys, '{}'); used text[] := '{}'; hit text[];
begin
  for c in
    select cl.table_name, cl.column_name
    from information_schema.columns cl
    join information_schema.tables t on t.table_schema = cl.table_schema and t.table_name = cl.table_name
    where cl.table_schema = 'public' and t.table_type = 'BASE TABLE' and cl.table_name <> 'media_trash'
      and (cl.data_type in ('text', 'character varying', 'jsonb', 'json') or (cl.data_type = 'ARRAY' and cl.udt_name in ('_text', '_varchar')))
  loop
    exit when coalesce(array_length(remaining, 1), 0) = 0;
    execute format('select coalesce(array_agg(k), ''{}''::text[]) from unnest($1::text[]) k where exists (select 1 from public.%I t where t.%I::text like ''%%'' || k || ''%%'')',
                   c.table_name, c.column_name) using remaining into hit;
    if coalesce(array_length(hit, 1), 0) > 0 then
      used := used || hit;
      remaining := array(select r from unnest(remaining) r where r <> all (hit));
    end if;
  end loop;
  return used;
end;
$$;
revoke execute on function public.media_in_use(text[]) from public, anon, authenticated;

-- The next files that are due to be deleted AND that nothing uses. A file that something still uses is kept and its request is dropped.
create or replace function public.media_purge_next(p_limit integer, p_respect_switch boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare due text[]; used text[]; res text[]; lim integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if p_respect_switch and coalesce((select value from public.internal_config where key = 'media_cleanup'), 'on') = 'off' then return '{}'; end if;
  select coalesce(array_agg(x.key), '{}') into due
    from (select key from public.media_trash where delete_after <= now() and attempts < 8 order by delete_after limit lim for update skip locked) x;
  if coalesce(array_length(due, 1), 0) = 0 then return '{}'; end if;
  used := public.media_in_use(due);
  if coalesce(array_length(used, 1), 0) > 0 then delete from public.media_trash where key = any (used); end if;
  res := array(select k from unnest(due) k where k <> all (used));
  if coalesce(array_length(res, 1), 0) > 0 then update public.media_trash set attempts = attempts + 1 where key = any (res); end if;
  return res;
end;
$$;
revoke execute on function public.media_purge_next(integer, boolean) from public, anon, authenticated;

-- For the Edge Function (proved by the private password, like the push and e-mail functions).
create or replace function public.media_purge_take(p_secret text, p_limit integer default 100) returns text[]
language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  return public.media_purge_next(p_limit, true);
end;
$$;
create or replace function public.media_purge_done(p_secret text, p_keys text[], p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  if p_error is null then
    delete from public.media_trash where key = any (coalesce(p_keys, '{}'));
  else
    update public.media_trash set last_error = left(p_error, 200) where key = any (coalesce(p_keys, '{}'));
  end if;
end;
$$;
revoke execute on function public.media_purge_take(text, integer) from public, anon, authenticated;
revoke execute on function public.media_purge_done(text, text[], text) from public, anon, authenticated;
grant execute on function public.media_purge_take(text, integer) to service_role;
grant execute on function public.media_purge_done(text, text[], text) to service_role;

-- Asks the Edge Function to empty the queue (only when something is due).
create or replace function public.kick_media_purge() returns void
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  if not exists (select 1 from public.media_trash where delete_after <= now() and attempts < 8) then return; end if;
  select value into u from public.internal_config where key = 'push_url';
  select value into s from public.internal_config where key = 'push_secret';
  if u is null or s is null then return; end if;
  begin
    perform net.http_post(url := u, body := jsonb_build_object('action', 'purge_media'),
                          headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
  exception when others then null;
  end;
end;
$$;
revoke execute on function public.kick_media_purge() from public, anon, authenticated;

-- ====================================================================================================================================== 3. Daily NOOB: settle on time, wipe everything
-- Same payout as before, plus: only one run at a time (a nightly job and a person opening the page can no longer pay a day twice), and ANY entry or vote left over from a day that
-- has ended is wiped too (for example entries made after an admin had already assigned that day's winners by hand). The files go to the queue by themselves (trigger above).
create or replace function public.settle_past_daily_challenges() returns text[]
language plpgsql security definer set search_path = public as $$
declare d record; top record; rank integer; purged text[] := '{}'; day_keys text[];
        w1 uuid; v1 integer; w2 uuid; v2 integer; w3 uuid; v3 integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('noob-settle-daily-challenges')) then return '{}'; end if;
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
  end loop;

  select coalesce(array_agg(media_url), '{}') into day_keys from public.daily_challenge_entries where challenge_date < current_date;
  purged := purged || day_keys;
  delete from public.daily_challenge_entries where challenge_date < current_date;
  delete from public.daily_challenge_votes where challenge_date < current_date;
  return purged;
end;
$$;
revoke execute on function public.settle_past_daily_challenges() from public, anon, authenticated;

-- Opening Daily NOOB still settles any finished day (as before), and now also gives the cleanup a nudge. The files are removed on the server, so nothing is handed to the phone.
create or replace function public.get_daily_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare today public.daily_challenges; me uuid := auth.uid();
begin
  perform public.settle_past_daily_challenges();
  perform public.kick_media_purge();
  today := public.ensure_daily_challenge(current_date);
  return jsonb_build_object(
    'challengeDate', today.challenge_date,
    'prompt', coalesce(today.custom_prompt, (select prompt from public.daily_challenge_prompts where id = today.prompt_id)),
    'hasSubmitted', me is not null and exists (select 1 from public.daily_challenge_entries e where e.challenge_date = today.challenge_date and e.user_id = me),
    'myVoteEntryId', (select v.entry_id from public.daily_challenge_votes v where v.challenge_date = today.challenge_date and v.voter_id = me),
    'purgedMediaKeys', '[]'::jsonb
  );
end;
$$;
grant execute on function public.get_daily_challenge() to authenticated;

-- Called by the app when it starts (at most once every 10 minutes for the whole app): settles finished Daily NOOB days and empties the deletion queue, so the cleanup
-- keeps happening even where no nightly job is available. It does nothing a person could abuse: it only asks the server to do what is already due.
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
  perform public.kick_media_purge();
exception when others then
  null;
end;
$$;
revoke execute on function public.poke_media_cleanup() from public, anon;
grant execute on function public.poke_media_cleanup() to authenticated;

-- ====================================================================================================================================== 4. files left behind before this existed
-- Every file in the bucket that is older than p_min_age and that NO row anywhere points to. The references are read from every text / json column of every table (any
-- "folder/name" written in it counts, in any shape: a bare name, "/media/..." or a full address), so nothing that is shown anywhere can be listed here. A file with an
-- unusual name is never listed.
create or replace function public.media_unused_candidates(p_min_age interval default interval '3 days')
returns table (name text, folder text, bytes bigint)
language plpgsql security definer set search_path = public as $$
declare c record; pat constant text := '([A-Za-z0-9_.~%@+=-]{1,120}(?:/[A-Za-z0-9_.~%@+=-]{1,120}){1,4})';
begin
  drop table if exists pg_temp._media_refs;
  create temp table _media_refs (k text primary key) on commit drop;
  for c in
    select cl.table_name, cl.column_name
    from information_schema.columns cl
    join information_schema.tables t on t.table_schema = cl.table_schema and t.table_name = cl.table_name
    where cl.table_schema = 'public' and t.table_type = 'BASE TABLE' and cl.table_name <> 'media_trash'
      and (cl.data_type in ('text', 'character varying', 'jsonb', 'json') or (cl.data_type = 'ARRAY' and cl.udt_name in ('_text', '_varchar')))
  loop
    execute format($q$
      insert into pg_temp._media_refs (k)
      select distinct s.k
      from public.%1$I t
      cross join lateral regexp_matches(t.%2$I::text, %3$L, 'g') m
      cross join lateral (select substr(m[1], p) as k from generate_series(1, length(m[1])) p where p = 1 or substr(m[1], p - 1, 1) = '/') s
      where t.%2$I is not null
      on conflict do nothing$q$, c.table_name, c.column_name, pat);
  end loop;
  return query
    select o.name::text, coalesce((storage.foldername(o.name))[1], '')::text, coalesce((o.metadata ->> 'size')::bigint, 0)
    from storage.objects o
    where o.bucket_id = 'media'
      and o.created_at < now() - coalesce(p_min_age, interval '3 days')
      and o.name ~ '^[A-Za-z0-9._~@+=-]+(/[A-Za-z0-9._~@+=-]+)*$'
      and not exists (select 1 from pg_temp._media_refs r where r.k = o.name)
      and not exists (select 1 from pg_temp._media_refs r where r.k = regexp_replace(o.name, '^.*/', ''))
      and not exists (select 1 from public.media_trash m where m.key = o.name);
end;
$$;
revoke execute on function public.media_unused_candidates(interval) from public, anon, authenticated;

-- ====================================================================================================================================== 5. admin functions
create or replace function public.admin_storage_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'files', (select count(*) from storage.objects where bucket_id = 'media'),
    'bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'media'),
    'folders', (select coalesce(jsonb_agg(jsonb_build_object('folder', f, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
                from (select coalesce((storage.foldername(name))[1], '(top level)') f, count(*) n, coalesce(sum((metadata ->> 'size')::bigint), 0) b
                      from storage.objects where bucket_id = 'media' group by 1) x),
    'queue', jsonb_build_object(
      'pending', (select count(*) from public.media_trash),
      'due', (select count(*) from public.media_trash where delete_after <= now()),
      'failed', (select count(*) from public.media_trash where attempts >= 8),
      'bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from public.media_trash m join storage.objects o on o.bucket_id = 'media' and o.name = m.key)),
    'cleanupEnabled', coalesce((select value from public.internal_config where key = 'media_cleanup'), 'on') <> 'off',
    'serverCleanupReady', exists (select 1 from public.internal_config where key = 'push_url') and exists (select 1 from public.internal_config where key = 'push_secret'));
end;
$$;
grant execute on function public.admin_storage_overview() to authenticated;

create or replace function public.admin_set_media_cleanup(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  insert into public.internal_config (key, value) values ('media_cleanup', case when coalesce(p_on, true) then 'on' else 'off' end)
    on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'cleanupEnabled', coalesce(p_on, true));
end;
$$;
grant execute on function public.admin_set_media_cleanup(boolean) to authenticated;

-- Looks for files nothing uses (nothing is changed).
create or replace function public.admin_media_scan(p_min_age_days integer default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  drop table if exists pg_temp._media_unused;
  create temp table _media_unused on commit drop as
    select * from public.media_unused_candidates(make_interval(days => least(greatest(coalesce(p_min_age_days, 3), 1), 365)));
  select jsonb_build_object(
    'files', (select count(*) from _media_unused),
    'bytes', (select coalesce(sum(bytes), 0) from _media_unused),
    'folders', (select coalesce(jsonb_agg(jsonb_build_object('folder', folder, 'files', n, 'bytes', b) order by b desc), '[]'::jsonb)
                from (select folder, count(*) n, coalesce(sum(bytes), 0) b from _media_unused group by folder) f),
    'sample', (select coalesce(jsonb_agg(name), '[]'::jsonb) from (select name from _media_unused order by name limit 6) s))
  into res;
  return res;
end;
$$;
grant execute on function public.admin_media_scan(integer) to authenticated;

-- Puts the unused files in the queue (deleted in 24 hours unless cancelled). At most p_limit at a time.
create or replace function public.admin_media_queue_unused(p_min_age_days integer default 3, p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 500), 1), 2000); queued integer; total integer;
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  drop table if exists pg_temp._media_unused;
  create temp table _media_unused on commit drop as
    select * from public.media_unused_candidates(make_interval(days => least(greatest(coalesce(p_min_age_days, 3), 1), 365)));
  select count(*) into total from _media_unused;
  insert into public.media_trash (key, reason, delete_after)
    select name, 'unused file', now() + interval '24 hours' from _media_unused order by name limit lim
  on conflict (key) do nothing;
  get diagnostics queued = row_count;
  return jsonb_build_object('success', true, 'queued', queued, 'remaining', greatest(total - queued, 0));
end;
$$;
grant execute on function public.admin_media_queue_unused(integer, integer) to authenticated;

create or replace function public.admin_media_trash_cancel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  delete from public.media_trash;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'cancelled', n);
end;
$$;
grant execute on function public.admin_media_trash_cancel() to authenticated;

-- "Remove due files now" from the admin panel works even where the Edge Function is not deployed yet: the admin's own session may delete any file in storage, so the panel
-- asks for the next due files here, deletes them through the storage API, and reports back.
create or replace function public.admin_media_purge_take(p_limit integer default 100) returns text[]
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return public.media_purge_next(p_limit, false);
end;
$$;
grant execute on function public.admin_media_purge_take(integer) to authenticated;

create or replace function public.admin_media_purge_done(p_keys text[], p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if p_error is null then
    delete from public.media_trash where key = any (coalesce(p_keys, '{}'));
  else
    update public.media_trash set last_error = left(p_error, 200) where key = any (coalesce(p_keys, '{}'));
  end if;
end;
$$;
grant execute on function public.admin_media_purge_done(text[], text) to authenticated;

-- The Daily NOOB admin page: one call gives everything it shows. It also settles any finished day first (so a day that has ended is never listed with its entries).
create or replace function public.admin_daily_overview(p_date date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_date, current_date); ch public.daily_challenges; st public.daily_challenge_settlements;
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  perform public.settle_past_daily_challenges();
  perform public.kick_media_purge();
  select * into ch from public.daily_challenges where challenge_date = d;
  select * into st from public.daily_challenge_settlements where challenge_date = d;
  return jsonb_build_object(
    'today', current_date,
    'date', d,
    'prompt', coalesce(ch.custom_prompt, (select prompt from public.daily_challenge_prompts where id = ch.prompt_id)),
    'customPrompt', ch.custom_prompt,
    'settled', st.challenge_date is not null,
    'podium', (select coalesce(jsonb_agg(jsonb_build_object('rank', t.rk, 'userId', t.uid, 'username', pp.username, 'votesCount', t.votes) order by t.rk), '[]'::jsonb)
               from (values (1, st.winner_id, st.winner_votes), (2, st.second_id, st.second_votes), (3, st.third_id, st.third_votes)) as t(rk, uid, votes)
               join public.profiles pp on pp.id = t.uid where t.uid is not null),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'userId', e.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
                  'mediaUrl', e.media_url, 'mediaType', e.media_type, 'caption', e.caption, 'votesCount', e.votes_count, 'createdAt', e.created_at
                ) order by e.votes_count desc, e.created_at asc), '[]'::jsonb)
                from public.daily_challenge_entries e join public.profiles a on a.id = e.user_id where e.challenge_date = d),
    'days', (select coalesce(jsonb_agg(x.j order by x.dt desc), '[]'::jsonb)
             from (select dc.challenge_date as dt, jsonb_build_object(
                     'date', dc.challenge_date,
                     'entries', (select count(*) from public.daily_challenge_entries e where e.challenge_date = dc.challenge_date),
                     'votes', (select count(*) from public.daily_challenge_votes v where v.challenge_date = dc.challenge_date),
                     'settled', exists (select 1 from public.daily_challenge_settlements s where s.challenge_date = dc.challenge_date),
                     'winner', (select pp.username from public.daily_challenge_settlements s join public.profiles pp on pp.id = s.winner_id where s.challenge_date = dc.challenge_date)
                   ) as j
                   from public.daily_challenges dc where dc.challenge_date >= current_date - 7 order by dc.challenge_date desc limit 8) x),
    'filesQueued', (select count(*) from public.media_trash where reason like 'daily_challenge_entries.%'));
end;
$$;
grant execute on function public.admin_daily_overview(date) to authenticated;

-- the admin functions refuse anyone who is not the admin, and are not even offered to signed-out visitors
revoke execute on function public.admin_storage_overview() from public, anon;
revoke execute on function public.admin_set_media_cleanup(boolean) from public, anon;
revoke execute on function public.admin_media_scan(integer) from public, anon;
revoke execute on function public.admin_media_queue_unused(integer, integer) from public, anon;
revoke execute on function public.admin_media_trash_cancel() from public, anon;
revoke execute on function public.admin_media_purge_take(integer) from public, anon;
revoke execute on function public.admin_media_purge_done(text[], text) from public, anon;
revoke execute on function public.admin_daily_overview(date) from public, anon;

-- ====================================================================================================================================== 6. the nightly jobs (only where pg_cron exists; the app also pokes the cleanup when it is used)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-daily-settle', '5 0 * * *', $job$ select public.settle_past_daily_challenges(); select public.kick_media_purge(); $job$);
    perform cron.schedule('noob-media-purge', '*/10 * * * *', $job$ select public.kick_media_purge(); $job$);
  end if;
exception when others then
  raise notice 'The storage cleanup jobs were not scheduled: %', sqlerrm;
end
$$;
