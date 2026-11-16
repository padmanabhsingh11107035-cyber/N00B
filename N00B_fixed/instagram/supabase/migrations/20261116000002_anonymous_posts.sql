-- Anonymous posts: an anonymous thought can carry ONE picture (2026-11-16). Everything that keeps a thought anonymous stays exactly as it was (migration 20261015000002):
-- the table can not be read by the app, the feed returns no author, the author column is never returned by any function.
-- The picture is stored as a file key only ("posts/<name>"); the file name is a time and random letters and says nothing about who uploaded it.
-- Honest limit (unchanged): this hides the author from other people, not from the service itself.
-- Safe to run more than once.

alter table public.anon_messages add column if not exists media_key text;
alter table public.anon_messages drop constraint if exists anon_messages_media_key_check;
alter table public.anon_messages add constraint anon_messages_media_key_check check (media_key is null or media_key ~ '^posts/[A-Za-z0-9._-]{6,120}$');
-- a picture may come without words; words alone are still 1 to 1000 characters
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.anon_messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%char_length(body)%' loop
    execute format('alter table public.anon_messages drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.anon_messages add constraint anon_messages_body_check check (char_length(body) <= 1000 and (char_length(body) >= 1 or media_key is not null));

-- the feed: the same rows as before, each with its picture (if it has one)
create or replace function public.anon_messages_feed(p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  msgs jsonb;
  total int;
begin
  with page as (
    select m.id, m.body, m.created_at, m.media_key, row_number() over (order by m.created_at desc, m.id desc) as rn
    from public.anon_messages m
    where m.removed_at is null and not m.hidden
      and (p_before is null or (m.created_at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.created_at desc, m.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'mediaKey', media_key) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
grant execute on function public.anon_messages_feed(int, timestamptz, uuid) to anon, authenticated;

-- the administrator's list: the same, with the picture
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
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'mediaKey', media_key, 'hidden', hidden, 'reportCount', reports, 'reasons', reasons) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
revoke execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) to authenticated;

-- posting with a picture (words are optional then). The same limits as a thought: 1 per 20 seconds, 5 per hour, 20 per day, at most 2 links, no repeated text within a day.
create or replace function public.anon_post_create(p_body text, p_media_key text, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text;
  found_row record;
  n int;
  new_id uuid;
  made timestamptz;
begin
  if me is null then raise exception 'Please log in to share a post.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not post right now.'; end if;
  if exists (select 1 from public.anon_message_bans where user_id = me) then raise exception 'You can no longer share anonymously.'; end if;

  if p_media_key is null or p_media_key !~ '^posts/[A-Za-z0-9._-]{6,120}$' then raise exception 'Add a picture first.'; end if;
  clean := public.anon_clean_text(p_body);
  if char_length(clean) > 1000 then raise exception 'The words can be at most 1000 characters.'; end if;
  if p_client_key is not null and char_length(p_client_key) > 64 then raise exception 'Invalid request.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('anon_message_post:' || me::text, 0));

  if p_client_key is not null then
    select m.id, m.body, m.created_at, m.media_key into found_row from public.anon_messages m where m.author_id = me and m.client_key = p_client_key;
    if found then
      return jsonb_build_object('id', found_row.id, 'body', found_row.body, 'createdAt', found_row.created_at, 'mediaKey', found_row.media_key, 'duplicate', true);
    end if;
  end if;

  if (char_length(clean) - char_length(replace(lower(clean), 'http', ''))) / 4 > 2 then raise exception 'Please do not post more than two links.'; end if;
  if exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '20 seconds') then raise exception 'Please wait a moment before sharing again.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'You have shared a lot just now. Please try again a little later.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'You have reached today''s limit for anonymous posts. Please try again tomorrow.'; end if;
  if exists (select 1 from public.anon_messages where media_key = p_media_key) then raise exception 'That picture is already shared.'; end if;
  if clean <> '' and exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '24 hours' and lower(body) = lower(clean)) then raise exception 'You already shared that.'; end if;

  insert into public.anon_messages (body, media_key, author_id, client_key) values (clean, p_media_key, me, p_client_key) returning id, created_at into new_id, made;
  return jsonb_build_object('id', new_id, 'body', clean, 'createdAt', made, 'mediaKey', p_media_key);
end;
$$;
revoke execute on function public.anon_post_create(text, text, text) from public, anon;
grant execute on function public.anon_post_create(text, text, text) to authenticated;
