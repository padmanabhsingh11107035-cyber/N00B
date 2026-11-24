-- Ask Me Anything for people WITHOUT an account: anyone who opens a person's question link can send a question, even if they are not on NOOB.
-- Privacy is the same as before: the owner never sees who asked. A guest is identified only by a private key made from the connection address and a random id kept on that device
-- (stored as an md5 hash, never returned by any function). It is used only to stop abuse (limits, "block this sender", a ban by an administrator).
-- Guests are limited more tightly than people who are logged in: no links, 1 question per 30 seconds, 6 per hour and 20 per day per key, 3 per day to the same person,
-- and a person who is receiving a flood of questions is protected. Safe to run more than once.

alter table public.ask_questions add column if not exists guest_key text;      -- PRIVATE: hash of the connection address (never returned)
alter table public.ask_questions add column if not exists device_key text;     -- PRIVATE: hash of the random id kept on the guest's device (never returned)
create index if not exists ask_questions_guest_time_idx on public.ask_questions (guest_key, created_at desc) where guest_key is not null;
create index if not exists ask_questions_device_time_idx on public.ask_questions (device_key, created_at desc) where device_key is not null;

create table if not exists public.ask_guest_blocks (
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (recipient_id, key)
);
create table if not exists public.ask_guest_bans (
  key text primary key,
  banned_at timestamptz not null default now(),
  banned_by uuid,
  reason text
);
alter table public.ask_guest_blocks enable row level security;
alter table public.ask_guest_bans enable row level security;
revoke all on public.ask_guest_blocks, public.ask_guest_bans from public, anon, authenticated;

-- The connection address of this request, as the web gateway passes it on ('' when it is not there).
create or replace function public.ask_request_ip() returns text
language plpgsql stable set search_path = public as $$
declare h json; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return ''; end if;
  ip := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''), '');
  return ip;
end;
$$;
revoke execute on function public.ask_request_ip() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- a guest asks
create or replace function public.ask_send_guest(p_username text, p_body text, p_client_key text default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  recip uuid;
  clean text;
  n int;
  ip text := public.ask_request_ip();
  gk text;
  dk text;
begin
  if p_device is null or char_length(btrim(p_device)) < 16 or char_length(p_device) > 80 then raise exception 'Could not send your question. Please reload the page and try again.'; end if;
  dk := md5('d:' || btrim(p_device));
  gk := case when ip <> '' then md5('i:' || ip) else null end;
  if exists (select 1 from public.ask_guest_bans b where b.key in (dk, coalesce(gk, dk))) then raise exception 'You can no longer send anonymous questions.'; end if;

  select id into recip from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) and not is_suspended and not is_ai;
  if recip is null then raise exception 'That person was not found.'; end if;
  if not coalesce((select s.enabled from public.ask_settings s where s.user_id = recip), true) then raise exception 'This person is not taking questions right now.'; end if;
  if exists (select 1 from public.ask_guest_blocks k where k.recipient_id = recip and k.key in (dk, coalesce(gk, dk))) then raise exception 'Questions to this person are not available.'; end if;

  clean := public.fun_clean_text(p_body);
  if char_length(clean) < 2 then raise exception 'Write your question first.'; end if;
  if char_length(clean) > 500 then raise exception 'Questions can be at most 500 characters.'; end if;
  if p_client_key is not null and char_length(p_client_key) > 64 then raise exception 'Invalid request.'; end if;
  if lower(clean) ~ '(https?:|www\.|\.(com|net|org|io|xyz|me|in|co|ly|app)(/|\s|$))' then raise exception 'Please do not include links in your question.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ask_guest:' || coalesce(gk, dk), 0));

  if p_client_key is not null and exists (select 1 from public.ask_questions where device_key = dk and client_key = p_client_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if exists (select 1 from public.ask_questions where (device_key = dk or (gk is not null and guest_key = gk)) and created_at > now() - interval '30 seconds') then raise exception 'Please wait a moment before sending another question.'; end if;
  select count(*) into n from public.ask_questions where (device_key = dk or (gk is not null and guest_key = gk)) and created_at > now() - interval '1 hour';
  if n >= 6 then raise exception 'You have sent a lot of questions just now. Please try again a little later.'; end if;
  select count(*) into n from public.ask_questions where (device_key = dk or (gk is not null and guest_key = gk)) and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'You have reached today''s limit for questions. Please try again tomorrow.'; end if;
  select count(*) into n from public.ask_questions where recipient_id = recip and (device_key = dk or (gk is not null and guest_key = gk)) and created_at > now() - interval '24 hours';
  if n >= 3 then raise exception 'You have asked this person a lot today. Please give them time to answer.'; end if;
  if exists (select 1 from public.ask_questions where recipient_id = recip and (device_key = dk or (gk is not null and guest_key = gk)) and created_at > now() - interval '24 hours' and lower(body) = lower(clean)) then raise exception 'You already asked this person that.'; end if;
  select count(*) into n from public.ask_questions where recipient_id = recip and created_at > now() - interval '1 hour';
  if n >= 200 then raise exception 'This person is getting a lot of questions right now. Please try again later.'; end if;
  select count(*) into n from public.ask_questions where guest_key is not null and created_at > now() - interval '1 hour' and device_key is not null;
  if n >= 3000 then raise exception 'Too many questions are being sent right now. Please try again later.'; end if;

  insert into public.ask_questions (recipient_id, sender_id, body, client_key, guest_key, device_key) values (recip, null, clean, p_client_key, gk, dk);

  if not exists (select 1 from public.notifications nt where nt.target_user_id = recip and nt.type = 'ask_question' and nt.created_at > now() - interval '10 minutes') then
    insert into public.notifications (target_user_id, actor_id, type, title, message)
    values (recip, null, 'ask_question', 'New anonymous question', 'Someone asked you a question. Open Ask Me Anything to read it.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_send_guest(text, text, text, text) from public;
grant execute on function public.ask_send_guest(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the owner can block a guest too (still without learning who it is)
create or replace function public.ask_block_sender(p_question uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid;
  gk text;
  dk text;
  found_q boolean := false;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select q.sender_id, q.guest_key, q.device_key, true into who, gk, dk, found_q from public.ask_questions q where q.id = p_question and q.recipient_id = me and q.deleted_at is null;
  if not coalesce(found_q, false) then raise exception 'That question is no longer there.'; end if;
  if who is not null then insert into public.ask_blocks (recipient_id, sender_id) values (me, who) on conflict do nothing; end if;
  if dk is not null then insert into public.ask_guest_blocks (recipient_id, key) values (me, dk) on conflict do nothing; end if;
  if gk is not null then insert into public.ask_guest_blocks (recipient_id, key) values (me, gk) on conflict do nothing; end if;
  update public.ask_questions set deleted_at = now(), answer_public = false where id = p_question;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_block_sender(uuid) from public, anon;
grant execute on function public.ask_block_sender(uuid) to authenticated;

-- An administrator removing a reported question can also stop its sender (account or guest) from asking anyone.
create or replace function public.ask_admin_remove(p_question uuid, p_ban_sender boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  gk text;
  dk text;
  to_user uuid;
  rc int := 0;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  update public.ask_questions set removed_at = now(), removed_by = auth.uid(), answer_public = false where id = p_question and removed_at is null
    returning sender_id, guest_key, device_key, recipient_id into who, gk, dk, to_user;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That question is no longer there.'; end if;
  if coalesce(p_ban_sender, false) then
    if who is not null then insert into public.ask_bans (user_id, banned_by, reason) values (who, auth.uid(), 'A reported anonymous question was removed') on conflict do nothing; end if;
    if dk is not null then insert into public.ask_guest_bans (key, banned_by, reason) values (dk, auth.uid(), 'A reported anonymous question was removed') on conflict do nothing; end if;
    -- (the connection address is not banned: many people can share one, so only this device is)
  end if;
  perform public.log_admin_action('ask_question_removed', to_user, jsonb_build_object('questionId', p_question, 'senderBanned', coalesce(p_ban_sender, false) and (who is not null or dk is not null)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_admin_remove(uuid, boolean) from public, anon;
grant execute on function public.ask_admin_remove(uuid, boolean) to authenticated;
