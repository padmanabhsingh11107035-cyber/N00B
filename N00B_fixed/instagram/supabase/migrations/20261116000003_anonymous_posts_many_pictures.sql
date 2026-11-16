-- Anonymous posts with several pictures (2026-11-16): up to 10 pictures in one anonymous post, no video.
-- Everything that keeps the author hidden is unchanged (migrations 20261015000002 and 20261116000002): the table can not be read by the app and no function returns the author.
-- media_keys holds all the pictures in order; media_key stays the first one, so a post made before this still shows.
-- Safe to run more than once.

alter table public.anon_messages add column if not exists media_keys text[];
alter table public.anon_messages drop constraint if exists anon_messages_media_keys_check;
alter table public.anon_messages add constraint anon_messages_media_keys_check check (media_keys is null or (cardinality(media_keys) between 1 and 10));

-- the feed: each row with all its pictures
create or replace function public.anon_messages_feed(p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  msgs jsonb;
  total int;
begin
  with page as (
    select m.id, m.body, m.created_at, m.media_key,
           coalesce(m.media_keys, case when m.media_key is not null then array[m.media_key] end) as keys,
           row_number() over (order by m.created_at desc, m.id desc) as rn
    from public.anon_messages m
    where m.removed_at is null and not m.hidden
      and (p_before is null or (m.created_at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.created_at desc, m.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'mediaKey', media_key, 'mediaKeys', to_jsonb(keys)) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
grant execute on function public.anon_messages_feed(int, timestamptz, uuid) to anon, authenticated;

-- the administrator's list: the same, with all the pictures
create or replace function public.anon_messages_admin_feed(p_limit int default 30, p_before timestamptz default null, p_before_id uuid default null, p_only_reported boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  msgs jsonb;
  total int;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  with page as (
    select m.id, m.body, m.created_at, m.hidden, m.media_key,
           coalesce(m.media_keys, case when m.media_key is not null then array[m.media_key] end) as keys,
           (select count(*) from public.anon_message_reports r where r.message_id = m.id) as reports,
           coalesce((select jsonb_agg(x.reason) from (select r.reason from public.anon_message_reports r where r.message_id = m.id and coalesce(r.reason, '') <> '' order by r.created_at limit 5) x), '[]'::jsonb) as reasons,
           row_number() over (order by m.created_at desc, m.id desc) as rn
    from public.anon_messages m
    where m.removed_at is null
      and (not p_only_reported or exists (select 1 from public.anon_message_reports r where r.message_id = m.id))
      and (p_before is null or (m.created_at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.created_at desc, m.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'mediaKey', media_key, 'mediaKeys', to_jsonb(keys), 'hidden', hidden, 'reportCount', reports, 'reasons', reasons) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
revoke execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) to authenticated;

-- posting with 1 to 10 pictures (words are optional). The same limits as a thought: 1 per 20 seconds, 5 per hour, 20 per day, at most 2 links, no repeated text within a day.
create or replace function public.anon_post_create_many(p_body text, p_media_keys text[], p_client_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text;
  found_row record;
  n int;
  k text;
  new_id uuid;
  made timestamptz;
begin
  if me is null then raise exception 'Please log in to share a post.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not post right now.'; end if;
  if exists (select 1 from public.anon_message_bans where user_id = me) then raise exception 'You can no longer share anonymously.'; end if;

  n := coalesce(cardinality(p_media_keys), 0);
  if n < 1 then raise exception 'Add a picture first.'; end if;
  if n > 10 then raise exception 'A post can have at most 10 pictures.'; end if;
  foreach k in array p_media_keys loop
    if k is null or k !~ '^posts/[A-Za-z0-9._-]{6,120}$' or lower(k) ~ '\.(mp4|mov|webm|m4v|avi|mkv)$' then raise exception 'Only pictures can be added.'; end if;
  end loop;
  if (select count(distinct x) from unnest(p_media_keys) x) <> n then raise exception 'The same picture was added twice.'; end if;

  clean := public.anon_clean_text(p_body);
  if char_length(clean) > 1000 then raise exception 'The words can be at most 1000 characters.'; end if;
  if p_client_key is not null and char_length(p_client_key) > 64 then raise exception 'Invalid request.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('anon_message_post:' || me::text, 0));

  if p_client_key is not null then
    select m.id, m.body, m.created_at, m.media_key, m.media_keys into found_row from public.anon_messages m where m.author_id = me and m.client_key = p_client_key;
    if found then
      return jsonb_build_object('id', found_row.id, 'body', found_row.body, 'createdAt', found_row.created_at, 'mediaKey', found_row.media_key, 'mediaKeys', to_jsonb(found_row.media_keys), 'duplicate', true);
    end if;
  end if;

  if (char_length(clean) - char_length(replace(lower(clean), 'http', ''))) / 4 > 2 then raise exception 'Please do not post more than two links.'; end if;
  if exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '20 seconds') then raise exception 'Please wait a moment before sharing again.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'You have shared a lot just now. Please try again a little later.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'You have reached today''s limit for anonymous posts. Please try again tomorrow.'; end if;
  if exists (select 1 from public.anon_messages m where m.media_key = any (p_media_keys) or m.media_keys && p_media_keys) then raise exception 'One of those pictures is already shared.'; end if;
  if clean <> '' and exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '24 hours' and lower(body) = lower(clean)) then raise exception 'You already shared that.'; end if;

  insert into public.anon_messages (body, media_key, media_keys, author_id, client_key) values (clean, p_media_keys[1], p_media_keys, me, p_client_key) returning id, created_at into new_id, made;
  return jsonb_build_object('id', new_id, 'body', clean, 'createdAt', made, 'mediaKey', p_media_keys[1], 'mediaKeys', to_jsonb(p_media_keys));
end;
$$;
revoke execute on function public.anon_post_create_many(text, text[], text) from public, anon;
grant execute on function public.anon_post_create_many(text, text[], text) to authenticated;
