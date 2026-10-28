-- NOOB — the AI moderator ("NOOB Safety"). Only the main administrator sees it (Admin Control Panel -> Moderator).
--
-- WHAT IT WATCHES: only what people PUBLISH — posts and reels (caption + first pictures), comments and replies, and the public profile text (bio, display name).
-- It NEVER reads chats, group chats, calls, anonymous messages, drafts or anything private: there is no trigger on those tables.
--
-- HOW IT WORKS: the moment something public is saved, a trigger writes a job and asks the Edge Function "moderator" (through pg_net, the same way push and e-mails
-- already work). The function asks the AI (Groq) for a verdict and hands it back to mod_apply(), which does ALL the enforcing here in SQL (so it is atomic and tested):
--   * a bad word in a comment / caption / bio / name  -> only that word is removed (a comment that is severe is deleted whole)
--   * a severe post / reel (or a picture that breaks the rules) -> the whole post / reel is deleted
--   * the person gets an in-app notice (instantly, through realtime) and an e-mail
--   * every enforced action is a strike; at N strikes in D days the account is suspended, with the reason logged. Critical things (e.g. sexual content with
--     minors, credible threats) suspend at once.
--   * unsure (confidence below the threshold) -> nothing is touched; it is only written in the log for the administrator to look at.
-- Modes: off | watch (judges and logs, touches NOTHING) | enforce. Starts in WATCH so nobody is punished before the administrator has seen how it judges.
-- The main administrator, staff accounts named admin and AI accounts are never judged. Safe to run more than once.

-- ============================================================================================================ settings
create table if not exists public.moderation_settings (
  id                 boolean primary key default true check (id),
  mode               text    not null default 'watch' check (mode in ('off', 'watch', 'enforce')),
  strictness         text    not null default 'standard' check (strictness in ('standard', 'strict')),
  strikes_to_suspend integer not null default 3 check (strikes_to_suspend between 1 and 20),
  strike_window_days integer not null default 30 check (strike_window_days between 1 and 365),
  min_confidence     numeric not null default 0.85 check (min_confidence between 0.6 and 1),
  updated_at         timestamptz not null default now()
);
insert into public.moderation_settings (id) values (true) on conflict (id) do nothing;
alter table public.moderation_settings enable row level security;
revoke all on public.moderation_settings from anon, authenticated;

-- ============================================================================================================ jobs and log
create table if not exists public.moderation_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('post', 'reel', 'comment', 'bio', 'name')),
  target_id   uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'working', 'done', 'failed', 'skipped')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  finished_at timestamptz
);
create index if not exists moderation_jobs_status_idx on public.moderation_jobs (status, created_at);
create index if not exists moderation_jobs_user_idx on public.moderation_jobs (user_id);
alter table public.moderation_jobs enable row level security;
revoke all on public.moderation_jobs from anon, authenticated;

-- Only things that broke a rule (or looked like it) are written down: clean content leaves no trace here.
create table if not exists public.moderation_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  username      text not null default '',
  kind          text not null,
  target_id     uuid,
  content       text not null default '',
  media         text[] not null default '{}',
  category      text not null default 'other',
  severity      text not null default 'mild',
  confidence    numeric not null default 0,
  reason        text not null default '',
  words         text[] not null default '{}',
  action        text not null check (action in ('deleted', 'words_removed', 'flagged')),
  applied       boolean not null default false,      -- false = watch mode or only flagged: nothing was touched
  strike_no     integer not null default 0,
  strike_limit  integer not null default 0,
  suspended     boolean not null default false,
  forgiven      boolean not null default false,
  forgiven_at   timestamptz,
  email_status  text not null default 'none' check (email_status in ('none', 'pending', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts integer not null default 0,
  email_error   text,
  email_claimed_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists moderation_log_user_idx on public.moderation_log (user_id, created_at desc);
create index if not exists moderation_log_created_idx on public.moderation_log (created_at desc);
alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;

-- ============================================================================================================ helpers
-- people who are never judged: the administrator, accounts marked admin, AI accounts
create or replace function public.mod_exempt(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin or p.is_ai or lower(p.username) = 'noob' from public.profiles p where p.id = p_user), true);
$$;
revoke execute on function public.mod_exempt(uuid) from public, anon, authenticated;

-- takes the listed words out of a text (whole words only, any case), then tidies the spaces
create or replace function public.mod_strip_words(p_text text, p_words text[]) returns text
language plpgsql immutable set search_path = public as $$
declare t text := coalesce(p_text, ''); w text;
begin
  foreach w in array coalesce(p_words, '{}') loop
    w := btrim(coalesce(w, ''));
    if length(w) < 2 then continue; end if;
    t := regexp_replace(t, '(?<![[:alnum:]])' || regexp_replace(w, '([.\\^$*+?()\[\]{}|-])', '\\\1', 'g') || '(?![[:alnum:]])', '', 'gi');
  end loop;
  return btrim(regexp_replace(t, '[ \t]{2,}', ' ', 'g'));
end;
$$;
revoke execute on function public.mod_strip_words(text, text[]) from public, anon, authenticated;

-- writes a job down and asks the Edge Function to judge it. NEVER stops the thing that caused it: every problem is swallowed.
create or replace function public.mod_enqueue(p_kind text, p_target uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m text; jid uuid; u text; s text;
begin
  select mode into m from public.moderation_settings where id;
  if coalesce(m, 'off') = 'off' or public.mod_exempt(p_user) then return; end if;
  if exists (select 1 from public.moderation_jobs where kind = p_kind and target_id = p_target and status in ('pending', 'working')) then return; end if;
  insert into public.moderation_jobs (kind, target_id, user_id) values (p_kind, p_target, p_user) returning id into jid;
  begin
    select value into u from public.internal_config where key = 'push_url';
    select value into s from public.internal_config where key = 'push_secret';
    if u is not null and s is not null then
      perform net.http_post(url := regexp_replace(u, '/[^/]+$', '/moderator'),
                            body := jsonb_build_object('action', 'moderate', 'jobId', jid),
                            headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
    end if;
  exception when others then
    null;
  end;
exception when others then
  null;
end;
$$;
revoke execute on function public.mod_enqueue(text, uuid, uuid) from public, anon, authenticated;

-- ============================================================================================================ triggers (only PUBLIC things)
create or replace function public.mod_trg_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_enqueue('post', new.id, new.user_id);
  return null;
exception when others then
  return null;
end;
$$;
drop trigger if exists zz_moderate_post on public.posts;
create trigger zz_moderate_post after insert on public.posts for each row execute function public.mod_trg_post();
drop trigger if exists zz_moderate_post_edit on public.posts;
create trigger zz_moderate_post_edit after update of caption on public.posts for each row
  when (old.caption is distinct from new.caption) execute function public.mod_trg_post();

create or replace function public.mod_trg_reel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_enqueue('reel', new.id, new.user_id);
  return null;
exception when others then
  return null;
end;
$$;
drop trigger if exists zz_moderate_reel on public.reels;
create trigger zz_moderate_reel after insert on public.reels for each row execute function public.mod_trg_reel();
drop trigger if exists zz_moderate_reel_edit on public.reels;
create trigger zz_moderate_reel_edit after update of caption on public.reels for each row
  when (old.caption is distinct from new.caption) execute function public.mod_trg_reel();

create or replace function public.mod_trg_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_enqueue('comment', new.id, new.user_id);
  return null;
exception when others then
  return null;
end;
$$;
drop trigger if exists zz_moderate_comment on public.comments;
create trigger zz_moderate_comment after insert on public.comments for each row execute function public.mod_trg_comment();

create or replace function public.mod_trg_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.bio is distinct from old.bio then perform public.mod_enqueue('bio', new.id, new.id); end if;
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then perform public.mod_enqueue('name', new.id, new.id); end if;
  return null;
exception when others then
  return null;
end;
$$;
drop trigger if exists zz_moderate_profile on public.profiles;
create trigger zz_moderate_profile after insert on public.profiles for each row execute function public.mod_trg_profile();
drop trigger if exists zz_moderate_profile_edit on public.profiles;
create trigger zz_moderate_profile_edit after update of bio, display_name on public.profiles for each row
  when (old.bio is distinct from new.bio or old.display_name is distinct from new.display_name) execute function public.mod_trg_profile();

-- trigger functions are never called by a person: nobody (visitor or member) may run them directly
revoke execute on function public.mod_trg_post(), public.mod_trg_reel(), public.mod_trg_comment(), public.mod_trg_profile() from public, anon, authenticated;

-- ============================================================================================================ the Edge Function's door
-- Every function below checks the private password (internal_config.push_secret), exactly like email_claim: only the Edge Function knows it.
create or replace function public.mod_check_secret(p_secret text) returns void
language plpgsql stable security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
end;
$$;
revoke execute on function public.mod_check_secret(text) from public, anon, authenticated;

-- hands the Edge Function what to judge (claims the job so two callers never judge the same thing twice)
create or replace function public.mod_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.moderation_jobs; s public.moderation_settings; txt text := ''; imgs text[] := '{}'; uname text; extra text;
begin
  perform public.mod_check_secret(p_secret);
  update public.moderation_jobs set status = 'working', attempts = attempts + 1, claimed_at = now()
  where id = p_id and attempts < 5 and (status = 'pending' or (status = 'working' and claimed_at < now() - interval '5 minutes'))
  returning * into j;
  if not found then return jsonb_build_object('claimed', false); end if;
  select * into s from public.moderation_settings where id;
  select username into uname from public.profiles where id = j.user_id;
  if s.mode = 'off' or uname is null or public.mod_exempt(j.user_id) then
    update public.moderation_jobs set status = 'skipped', finished_at = now() where id = j.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;

  if j.kind = 'post' then
    select btrim(coalesce(p.caption, '') || ' ' || array_to_string(p.hashtags, ' ')) into txt from public.posts p where p.id = j.target_id;
    if found then
      select coalesce(string_agg(sl.caption, ' ' order by sl.position), '') into extra from public.post_slides sl where sl.post_id = j.target_id and coalesce(sl.caption, '') <> '';
      txt := btrim(coalesce(txt, '') || ' ' || coalesce(extra, ''));
      select coalesce(array_agg(x.media_url), '{}') into imgs from (
        select sl.media_url from public.post_slides sl where sl.post_id = j.target_id and sl.media_type = 'image' order by sl.position limit 2) x;
    else txt := null; end if;
  elsif j.kind = 'reel' then
    select btrim(coalesce(r.caption, '') || ' ' || array_to_string(r.hashtags, ' ')), case when coalesce(r.thumbnail_url, '') <> '' then array[r.thumbnail_url] else '{}'::text[] end
      into txt, imgs from public.reels r where r.id = j.target_id;
    if not found then txt := null; end if;
  elsif j.kind = 'comment' then
    select c.text into txt from public.comments c where c.id = j.target_id;
    if not found then txt := null; end if;
  elsif j.kind = 'bio' then
    select pr.bio into txt from public.profiles pr where pr.id = j.target_id;
  elsif j.kind = 'name' then
    select pr.display_name into txt from public.profiles pr where pr.id = j.target_id;
  end if;

  -- deleted meanwhile, or nothing to look at: done without asking the AI
  if txt is null or (btrim(txt) = '' and coalesce(array_length(imgs, 1), 0) = 0) or (length(btrim(txt)) < 2 and coalesce(array_length(imgs, 1), 0) = 0) then
    update public.moderation_jobs set status = 'skipped', finished_at = now() where id = j.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;
  return jsonb_build_object('claimed', true, 'jobId', j.id, 'kind', j.kind, 'userId', j.user_id, 'username', uname,
    'text', left(txt, 4000), 'images', to_jsonb(imgs), 'strictness', s.strictness, 'mode', s.mode);
end;
$$;
revoke execute on function public.mod_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.mod_claim(text, uuid) to service_role;

-- the AI was not reachable: try again later (5 tries), never punish for it
create or replace function public.mod_fail(p_secret text, p_id uuid, p_error text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_check_secret(p_secret);
  update public.moderation_jobs set status = case when attempts >= 5 then 'failed' else 'pending' end, last_error = left(coalesce(p_error, 'unknown'), 300),
    finished_at = case when attempts >= 5 then now() else null end
  where id = p_id and status = 'working';
  return true;
end;
$$;
revoke execute on function public.mod_fail(text, uuid, text) from public, anon, authenticated;
grant execute on function public.mod_fail(text, uuid, text) to service_role;

-- THE ENFORCER. p_verdict = { violation, severity: none|mild|severe|critical, category, confidence 0..1, words: [..], reason, mediaViolation }
create or replace function public.mod_apply(p_secret text, p_id uuid, p_verdict jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.moderation_jobs; s public.moderation_settings; v jsonb := coalesce(p_verdict, '{}'::jsonb);
  conf numeric; sev text; cat text; why text; words text[]; media_bad boolean; bad boolean; enforce boolean;
  uname text; content text := ''; media text[] := '{}'; act text; did_delete boolean := false;
  strikes integer := 0; susp boolean := false; lid uuid; admin_id uuid := public.noob_admin_id(); what text; msg text; ttl text; addr text; already boolean;
  cap text; tags text[]; fixed text; new_name text;
begin
  perform public.mod_check_secret(p_secret);
  select * into j from public.moderation_jobs where id = p_id and status = 'working' for update;
  if not found then return jsonb_build_object('applied', false, 'note', 'job not waiting'); end if;
  select * into s from public.moderation_settings where id;
  select username into uname from public.profiles where id = j.user_id;

  conf := least(1, greatest(0, coalesce(nullif(v->>'confidence', '')::numeric, 0)));
  sev := lower(coalesce(v->>'severity', 'none'));
  if sev not in ('none', 'mild', 'severe', 'critical') then sev := 'mild'; end if;
  media_bad := coalesce((v->>'mediaViolation')::boolean, false);
  bad := (coalesce((v->>'violation')::boolean, false) or media_bad) and sev <> 'none';
  cat := left(coalesce(nullif(btrim(v->>'category'), ''), 'other'), 40);
  why := left(coalesce(nullif(btrim(v->>'reason'), ''), 'it breaks the NOOB community rules'), 300);
  words := coalesce((select array_agg(left(btrim(w), 60)) from (select jsonb_array_elements_text(case when jsonb_typeof(v->'words') = 'array' then v->'words' else '[]'::jsonb end) as w limit 20) q where length(btrim(w)) >= 2), '{}');
  enforce := (s.mode = 'enforce');

  if not bad or s.mode = 'off' or uname is null or public.mod_exempt(j.user_id) then
    update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
    return jsonb_build_object('applied', false, 'clean', true);
  end if;

  -- what it was (kept in the log, so the administrator can judge it even after it is gone)
  if j.kind = 'post' then
    select btrim(coalesce(p.caption, '') || ' ' || array_to_string(p.hashtags, ' ')), p.caption, p.hashtags into content, cap, tags from public.posts p where p.id = j.target_id;
    select coalesce(array_agg(x.media_url), '{}') into media from (select sl.media_url from public.post_slides sl where sl.post_id = j.target_id order by sl.position limit 3) x;
  elsif j.kind = 'reel' then
    select btrim(coalesce(r.caption, '') || ' ' || array_to_string(r.hashtags, ' ')), r.caption, r.hashtags, array[r.video_url] into content, cap, tags, media from public.reels r where r.id = j.target_id;
  elsif j.kind = 'comment' then select c.text into content from public.comments c where c.id = j.target_id;
  elsif j.kind = 'bio' then select pr.bio into content from public.profiles pr where pr.id = j.target_id;
  elsif j.kind = 'name' then select pr.display_name into content from public.profiles pr where pr.id = j.target_id;
  end if;
  if content is null then   -- it is gone already (the owner deleted it): nothing to enforce
    update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
    return jsonb_build_object('applied', false, 'gone', true);
  end if;
  content := left(content, 1000);

  -- not sure enough: only written in the log for the administrator (no strike, nothing touched, the person is not told)
  if conf < s.min_confidence then
    if conf >= 0.6 then
      insert into public.moderation_log (user_id, username, kind, target_id, content, media, category, severity, confidence, reason, words, action, applied)
      values (j.user_id, uname, j.kind, j.target_id, content, media, cat, sev, conf, why, words, 'flagged', false);
    end if;
    update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
    return jsonb_build_object('applied', false, 'flagged', conf >= 0.6);
  end if;

  -- what to do about it
  if j.kind in ('post', 'reel') then
    act := case when media_bad or sev in ('severe', 'critical') or cardinality(words) = 0 then 'deleted' else 'words_removed' end;
  elsif j.kind = 'comment' then
    act := case when sev in ('severe', 'critical') or cardinality(words) = 0 or btrim(public.mod_strip_words(content, words)) = '' then 'deleted' else 'words_removed' end;
  else   -- bio / display name: cleared when the whole text is the problem, otherwise only the words go
    act := case when media_bad or sev in ('severe', 'critical') or cardinality(words) = 0 then 'deleted' else 'words_removed' end;
  end if;

  if not enforce then   -- WATCH mode: judged and written down, nothing touched, nobody told
    insert into public.moderation_log (user_id, username, kind, target_id, content, media, category, severity, confidence, reason, words, action, applied)
    values (j.user_id, uname, j.kind, j.target_id, content, media, cat, sev, conf, why, words, act, false) returning id into lid;
    update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
    return jsonb_build_object('applied', false, 'watched', true, 'logId', lid, 'action', act);
  end if;

  -- ENFORCE
  if act = 'deleted' then
    if j.kind = 'post' then delete from public.posts where id = j.target_id;
    elsif j.kind = 'reel' then delete from public.reels where id = j.target_id;
    elsif j.kind = 'comment' then delete from public.comments where id = j.target_id;
    elsif j.kind = 'bio' then update public.profiles set bio = '' where id = j.target_id;
    else update public.profiles set display_name = username where id = j.target_id;
    end if;
  else
    if j.kind = 'post' then
      update public.posts set caption = public.mod_strip_words(caption, words),
        hashtags = coalesce((select array_agg(h) from unnest(hashtags) h where public.mod_strip_words(h, words) = h), '{}') where id = j.target_id;
    elsif j.kind = 'reel' then
      update public.reels set caption = public.mod_strip_words(caption, words),
        hashtags = coalesce((select array_agg(h) from unnest(hashtags) h where public.mod_strip_words(h, words) = h), '{}') where id = j.target_id;
    elsif j.kind = 'comment' then update public.comments set text = public.mod_strip_words(text, words) where id = j.target_id;
    elsif j.kind = 'bio' then update public.profiles set bio = public.mod_strip_words(bio, words) where id = j.target_id;
    else
      select public.mod_strip_words(display_name, words) into new_name from public.profiles where id = j.target_id;
      update public.profiles set display_name = case when btrim(coalesce(new_name, '')) = '' then username else new_name end where id = j.target_id;
    end if;
  end if;

  -- the strike: this one counts too. The administrator can forgive any of them.
  insert into public.moderation_log (user_id, username, kind, target_id, content, media, category, severity, confidence, reason, words, action, applied, strike_limit)
  values (j.user_id, uname, j.kind, j.target_id, content, media, cat, sev, conf, why, words, act, true, s.strikes_to_suspend) returning id into lid;
  select count(*) into strikes from public.moderation_log
  where user_id = j.user_id and applied and not forgiven and action in ('deleted', 'words_removed') and created_at > now() - make_interval(days => s.strike_window_days);
  select is_suspended into already from public.profiles where id = j.user_id;
  susp := not coalesce(already, false) and (sev = 'critical' or strikes >= s.strikes_to_suspend);
  update public.moderation_log set strike_no = strikes, suspended = susp where id = lid;

  what := case j.kind when 'post' then 'post' when 'reel' then 'reel' when 'comment' then 'comment' when 'bio' then 'bio' else 'name' end;
  if act = 'deleted' then
    ttl := '⚠️ Your ' || what || ' was removed';
    msg := case when j.kind in ('bio', 'name') then 'Your ' || (case when j.kind = 'bio' then 'bio' else 'display name' end) || ' was cleared by NOOB Safety because ' || why
           else 'Your ' || what || ' was removed by NOOB Safety because ' || why end;
  else
    ttl := '⚠️ Offensive language was removed';
    msg := 'Offensive language was removed from your ' || (case when j.kind in ('post', 'reel') then what || ' caption' when j.kind = 'name' then 'display name' else what end) || ' by NOOB Safety. Reason: ' || why;
  end if;
  msg := msg || '. Warning ' || strikes || ' of ' || s.strikes_to_suspend || ': at ' || s.strikes_to_suspend || ' warnings in ' || s.strike_window_days || ' days the account is suspended.';
  perform public.notify_user(j.user_id, 'admin_direct', admin_id, msg, ttl);

  if susp then
    perform public.set_suspension(j.user_id, true,
      'Automatic safety system (NOOB Safety): ' || case when sev = 'critical' then 'a very serious violation' else strikes || ' violations of the community rules in ' || s.strike_window_days || ' days' end || '. Last: ' || why);
    perform public.notify_user(j.user_id, 'admin_direct', admin_id,
      'Your account @' || uname || ' has been suspended by NOOB Safety. Reason: ' || case when sev = 'critical' then 'a very serious violation of the community rules' else strikes || ' violations of the community rules in ' || s.strike_window_days || ' days' end || '. Last: ' || why || '. Our team will look at it.',
      '⚠️ Account suspended');
  end if;

  select lower(btrim(coalesce(pp.email, ''))) into addr from public.profile_private pp where pp.user_id = j.user_id;
  update public.moderation_log set email_status = case when addr is null or addr = '' or position('@' in addr) = 0 or addr like '%@users.nooob.xyz' then 'skipped' else 'pending' end where id = lid;
  update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
  return jsonb_build_object('applied', true, 'logId', lid, 'action', act, 'strike', strikes, 'suspended', susp,
    'emailPending', (select email_status = 'pending' from public.moderation_log where id = lid));
end;
$$;
revoke execute on function public.mod_apply(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mod_apply(text, uuid, jsonb) to service_role;

-- the e-mail (sent by the Edge Function; retried by retry_moderation below)
create or replace function public.mod_email_claim(p_secret text, p_log uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.moderation_log; addr text; v_name text;
begin
  perform public.mod_check_secret(p_secret);
  update public.moderation_log set email_status = 'sending', email_attempts = email_attempts + 1, email_claimed_at = now()
  where id = p_log and email_attempts < 4 and applied
    and (email_status = 'pending' or (email_status = 'sending' and email_claimed_at < now() - interval '10 minutes') or email_status = 'failed')
  returning * into l;
  if not found then return jsonb_build_object('claimed', false); end if;
  select lower(btrim(coalesce(pp.email, ''))) into addr from public.profile_private pp where pp.user_id = l.user_id;
  select coalesce(nullif(pr.display_name, ''), pr.username) into v_name from public.profiles pr where pr.id = l.user_id;
  if addr is null or addr = '' or position('@' in addr) = 0 or addr like '%@users.nooob.xyz' then
    update public.moderation_log set email_status = 'skipped', email_error = 'no real e-mail address on this account' where id = l.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;
  return jsonb_build_object('claimed', true, 'logId', l.id, 'email', addr, 'name', v_name, 'username', l.username, 'kind', l.kind, 'action', l.action,
    'reason', l.reason, 'strike', l.strike_no, 'limit', l.strike_limit, 'suspended', l.suspended, 'severity', l.severity, 'createdAt', l.created_at,
    'snippet', case when l.action = 'deleted' and l.kind in ('post', 'reel', 'comment') then left(l.content, 140) else '' end);
end;
$$;
revoke execute on function public.mod_email_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.mod_email_claim(text, uuid) to service_role;

create or replace function public.mod_email_done(p_secret text, p_log uuid, p_ok boolean, p_error text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.mod_check_secret(p_secret);
  update public.moderation_log set email_status = case when p_ok then 'sent' else 'failed' end, email_error = case when p_ok then null else left(coalesce(p_error, 'unknown'), 300) end where id = p_log;
  return true;
end;
$$;
revoke execute on function public.mod_email_done(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.mod_email_done(text, uuid, boolean, text) to service_role;

-- Anything left unfinished (the function was busy, the AI or the e-mail service was down) is asked again, every 5 minutes, for up to 2 days.
create or replace function public.retry_moderation() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; u text; s text; n integer := 0;
begin
  select value into u from public.internal_config where key = 'push_url';
  select value into s from public.internal_config where key = 'push_secret';
  if u is null or s is null then return 0; end if;
  u := regexp_replace(u, '/[^/]+$', '/moderator');
  for r in
    select id from public.moderation_jobs
    where attempts < 5 and created_at > now() - interval '2 days'
      and ((status = 'pending' and created_at < now() - interval '1 minute') or (status = 'working' and claimed_at < now() - interval '5 minutes'))
    order by created_at limit 40
  loop
    begin
      perform net.http_post(url := u, body := jsonb_build_object('action', 'moderate', 'jobId', r.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  for r in
    select id from public.moderation_log
    where applied and email_attempts < 4 and created_at > now() - interval '2 days'
      and ((email_status = 'pending' and created_at < now() - interval '1 minute') or email_status = 'failed' or (email_status = 'sending' and email_claimed_at < now() - interval '10 minutes'))
    order by created_at limit 40
  loop
    begin
      perform net.http_post(url := u, body := jsonb_build_object('action', 'email', 'logId', r.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  -- old finished jobs are not kept for ever (the log keeps the things that matter)
  delete from public.moderation_jobs where status in ('done', 'skipped') and finished_at < now() - interval '3 days';
  return n;
end;
$$;
revoke execute on function public.retry_moderation() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-moderation-retry', '*/5 * * * *', $job$ select public.retry_moderation(); $job$);
  end if;
exception when others then
  raise notice 'The moderation retry job was not scheduled: %', sqlerrm;
end
$$;

-- ============================================================================================================ the administrator's page (main administrator only)
create or replace function public.admin_moderation_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.moderation_settings;
begin
  perform public.require_master_admin('Only the NOOB administrator can open the moderator.');
  select * into s from public.moderation_settings where id;
  return jsonb_build_object('success', true,
    'settings', jsonb_build_object('mode', s.mode, 'strictness', s.strictness, 'strikesToSuspend', s.strikes_to_suspend, 'strikeWindowDays', s.strike_window_days, 'minConfidence', s.min_confidence),
    'counts', jsonb_build_object(
      'removed24h', (select count(*) from public.moderation_log where applied and action = 'deleted' and created_at > now() - interval '24 hours'),
      'wordsRemoved24h', (select count(*) from public.moderation_log where applied and action = 'words_removed' and created_at > now() - interval '24 hours'),
      'flagged', (select count(*) from public.moderation_log where action = 'flagged' and not forgiven and created_at > now() - interval '7 days'),
      'watched', (select count(*) from public.moderation_log where not applied and action <> 'flagged' and created_at > now() - interval '7 days'),
      'suspended7d', (select count(*) from public.moderation_log where suspended and created_at > now() - interval '7 days'),
      'waiting', (select count(*) from public.moderation_jobs where status in ('pending', 'working')),
      'failed', (select count(*) from public.moderation_jobs where status = 'failed' and created_at > now() - interval '2 days'),
      'emailsFailed', (select count(*) from public.moderation_log where email_status = 'failed' and email_attempts >= 4)));
end;
$$;
revoke execute on function public.admin_moderation_overview() from public, anon;
grant execute on function public.admin_moderation_overview() to authenticated;

create or replace function public.admin_moderation_log(p_filter text default 'all', p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f text := lower(coalesce(p_filter, 'all')); lim integer := least(greatest(coalesce(p_limit, 60), 1), 200);
begin
  perform public.require_master_admin('Only the NOOB administrator can open the moderator.');
  return jsonb_build_object('success', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'userId', l.user_id, 'username', l.username, 'isSuspended', coalesce(p.is_suspended, false), 'kind', l.kind, 'content', l.content, 'media', l.media,
      'category', l.category, 'severity', l.severity, 'confidence', l.confidence, 'reason', l.reason, 'words', l.words, 'action', l.action, 'applied', l.applied,
      'strikeNo', l.strike_no, 'strikeLimit', l.strike_limit, 'suspended', l.suspended, 'forgiven', l.forgiven, 'emailStatus', l.email_status, 'emailError', l.email_error,
      'createdAt', l.created_at) order by l.created_at desc)
    from (select * from public.moderation_log x
          where case f when 'removed' then x.applied and x.action in ('deleted', 'words_removed') when 'flagged' then x.action = 'flagged'
                      when 'suspended' then x.suspended when 'watched' then not x.applied and x.action <> 'flagged' else true end
          order by x.created_at desc limit lim) l
    left join public.profiles p on p.id = l.user_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_moderation_log(text, integer) from public, anon;
grant execute on function public.admin_moderation_log(text, integer) to authenticated;

create or replace function public.admin_moderation_set(p_mode text default null, p_strictness text default null, p_strikes integer default null, p_window integer default null, p_min_confidence numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can change the moderator.');
  if p_mode is not null and p_mode not in ('off', 'watch', 'enforce') then raise exception 'Mode must be off, watch or enforce.'; end if;
  if p_strictness is not null and p_strictness not in ('standard', 'strict') then raise exception 'Strictness must be standard or strict.'; end if;
  update public.moderation_settings set
    mode = coalesce(p_mode, mode), strictness = coalesce(p_strictness, strictness),
    strikes_to_suspend = least(20, greatest(1, coalesce(p_strikes, strikes_to_suspend))),
    strike_window_days = least(365, greatest(1, coalesce(p_window, strike_window_days))),
    min_confidence = least(1, greatest(0.6, coalesce(p_min_confidence, min_confidence))), updated_at = now()
  where id;
  perform public.log_admin_action('moderator_settings', null, jsonb_build_object('mode', p_mode, 'strictness', p_strictness, 'strikes', p_strikes, 'window', p_window, 'minConfidence', p_min_confidence));
  return public.admin_moderation_overview();
end;
$$;
revoke execute on function public.admin_moderation_set(text, text, integer, integer, numeric) from public, anon;
grant execute on function public.admin_moderation_set(text, text, integer, integer, numeric) to authenticated;

-- Withdraws one warning (a wrong call by the AI): it stops counting towards the suspension and the person is told. Does NOT bring back deleted content.
create or replace function public.admin_moderation_forgive(p_log uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.moderation_log;
begin
  perform public.require_master_admin('Only the NOOB administrator can change the moderator.');
  update public.moderation_log set forgiven = true, forgiven_at = now() where id = p_log and not forgiven returning * into l;
  if not found then return jsonb_build_object('success', false, 'error', 'That warning was not found, or is already withdrawn.'); end if;
  if l.applied then
    perform public.notify_user(l.user_id, 'admin_direct', public.noob_admin_id(), 'NOOB Safety looked again: a warning on your account was a mistake and has been withdrawn. Sorry about that.', '✅ A warning was withdrawn');
  end if;
  perform public.log_admin_action('moderator_forgive', l.user_id, jsonb_build_object('log', l.id));
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_moderation_forgive(uuid) from public, anon;
grant execute on function public.admin_moderation_forgive(uuid) to authenticated;
