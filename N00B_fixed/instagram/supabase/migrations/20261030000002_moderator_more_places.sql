-- NOOB Safety (the AI moderator), part 2: it now also watches the other PUBLIC places — stories (picture + the words on it), NOOB Videos (title, description, thumbnail),
-- Daily NOOB entries, public polls, live-stream comments, NOOB Rooms chat, and the profile status note. Still never anything private (chats, calls, anonymous messages).
-- It re-defines mod_claim / mod_apply on top of two small helpers (mod_fetch = what to judge, mod_enforce = what to do), so every place behaves the same way.
-- Safe to run more than once. Needs migration 20261030000001.

alter table public.moderation_jobs drop constraint if exists moderation_jobs_kind_check;
alter table public.moderation_jobs add constraint moderation_jobs_kind_check
  check (kind in ('post', 'reel', 'comment', 'bio', 'name', 'video', 'story', 'daily', 'poll', 'live', 'room', 'note'));

-- ============================================================================================================ what to judge
-- { found, text, images[] (looked at by the AI), media[] (kept in the log) }
create or replace function public.mod_fetch(p_kind text, p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare txt text; extra text; imgs text[] := '{}'; media text[] := '{}'; ok boolean := false; mt text; mu text;
begin
  if p_kind = 'post' then
    select btrim(coalesce(p.caption, '') || ' ' || array_to_string(p.hashtags, ' ')) into txt from public.posts p where p.id = p_target;
    ok := found;
    if ok then
      select coalesce(string_agg(sl.caption, ' ' order by sl.position), '') into extra from public.post_slides sl where sl.post_id = p_target and coalesce(sl.caption, '') <> '';
      txt := btrim(coalesce(txt, '') || ' ' || coalesce(extra, ''));
      select coalesce(array_agg(x.media_url), '{}') into imgs from (select sl.media_url from public.post_slides sl where sl.post_id = p_target and sl.media_type = 'image' order by sl.position limit 2) x;
      select coalesce(array_agg(x.media_url), '{}') into media from (select sl.media_url from public.post_slides sl where sl.post_id = p_target order by sl.position limit 3) x;
    end if;
  elsif p_kind = 'reel' then
    select btrim(coalesce(r.caption, '') || ' ' || array_to_string(r.hashtags, ' ')), case when coalesce(r.thumbnail_url, '') <> '' then array[r.thumbnail_url] else '{}'::text[] end, array[r.video_url]
      into txt, imgs, media from public.reels r where r.id = p_target;
    ok := found;
  elsif p_kind = 'comment' then
    select c.text into txt from public.comments c where c.id = p_target; ok := found;
  elsif p_kind = 'bio' then
    select pr.bio into txt from public.profiles pr where pr.id = p_target; ok := found;
  elsif p_kind = 'name' then
    select pr.display_name into txt from public.profiles pr where pr.id = p_target; ok := found;
  elsif p_kind = 'note' then
    select nullif(pr.status_note->>'text', '') into txt from public.profiles pr where pr.id = p_target and pr.status_note is not null; ok := found;
  elsif p_kind = 'video' then
    select btrim(coalesce(v.title, '') || ' ' || coalesce(v.description, '')), case when coalesce(v.thumbnail_url, '') <> '' then array[v.thumbnail_url] else '{}'::text[] end, array[v.video_url]
      into txt, imgs, media from public.long_videos v where v.id = p_target;
    ok := found;
  elsif p_kind = 'story' then
    select s.media_type, s.media_url,
           (select left(string_agg(q.v, ' '), 600) from (select x #>> '{}' as v from jsonb_path_query(coalesce(s.stickers, '[]'::jsonb), '$[*].data.**') x where jsonb_typeof(x) = 'string') q
            where length(q.v) between 3 and 200 and q.v !~* '^(https?:|/|data:|blob:)')
      into mt, mu, txt from public.stories s where s.id = p_target;
    ok := found;
    if ok then media := array[mu]; if mt = 'image' then imgs := array[mu]; end if; end if;
  elsif p_kind = 'daily' then
    select e.caption, e.media_type, e.media_url into txt, mt, mu from public.daily_challenge_entries e where e.id = p_target;
    ok := found;
    if ok then media := array[mu]; if mt = 'image' then imgs := array[mu]; end if; end if;
  elsif p_kind = 'poll' then
    select pl.question into txt from public.polls pl where pl.id = p_target and pl.removed_at is null; ok := found;
  elsif p_kind = 'live' then
    select c.text into txt from public.live_stream_comments c where c.id = p_target and c.gift_amount is null; ok := found;
  elsif p_kind = 'room' then
    select c.text, c.media_type, c.media_url into txt, mt, mu from public.noob_room_chat c where c.id = p_target;
    ok := found;
    if ok and coalesce(mu, '') <> '' then media := array[mu]; if mt in ('image', 'gif', 'sticker') then imgs := array[mu]; end if; end if;
  end if;
  return jsonb_build_object('found', ok, 'text', txt, 'images', to_jsonb(imgs), 'media', to_jsonb(media));
end;
$$;
revoke execute on function public.mod_fetch(text, uuid) from public, anon, authenticated;

-- ============================================================================================================ what to do
create or replace function public.mod_enforce(p_kind text, p_target uuid, p_act text, p_words text[]) returns void
language plpgsql security definer set search_path = public as $$
declare new_name text;
begin
  if p_act = 'deleted' then
    if p_kind = 'post' then delete from public.posts where id = p_target;
    elsif p_kind = 'reel' then delete from public.reels where id = p_target;
    elsif p_kind = 'comment' then delete from public.comments where id = p_target;
    elsif p_kind = 'video' then delete from public.long_videos where id = p_target;
    elsif p_kind = 'story' then delete from public.stories where id = p_target;
    elsif p_kind = 'daily' then delete from public.daily_challenge_entries where id = p_target;
    elsif p_kind = 'poll' then update public.polls set removed_at = now() where id = p_target and removed_at is null;
    elsif p_kind = 'live' then delete from public.live_stream_comments where id = p_target;
    elsif p_kind = 'room' then delete from public.noob_room_chat where id = p_target;
    elsif p_kind = 'bio' then update public.profiles set bio = '' where id = p_target;
    elsif p_kind = 'name' then update public.profiles set display_name = username where id = p_target;
    elsif p_kind = 'note' then update public.profiles set status_note = null where id = p_target;
    end if;
    return;
  end if;
  if p_kind = 'post' then
    update public.posts set caption = public.mod_strip_words(caption, p_words),
      hashtags = coalesce((select array_agg(h) from unnest(hashtags) h where public.mod_strip_words(h, p_words) = h), '{}') where id = p_target;
    update public.post_slides set caption = public.mod_strip_words(caption, p_words) where post_id = p_target and coalesce(caption, '') <> '';
  elsif p_kind = 'reel' then
    update public.reels set caption = public.mod_strip_words(caption, p_words),
      hashtags = coalesce((select array_agg(h) from unnest(hashtags) h where public.mod_strip_words(h, p_words) = h), '{}') where id = p_target;
  elsif p_kind = 'comment' then update public.comments set text = public.mod_strip_words(text, p_words) where id = p_target;
  elsif p_kind = 'video' then update public.long_videos set title = public.mod_strip_words(title, p_words), description = public.mod_strip_words(description, p_words) where id = p_target;
  elsif p_kind = 'daily' then update public.daily_challenge_entries set caption = public.mod_strip_words(caption, p_words) where id = p_target;
  elsif p_kind = 'poll' then update public.polls set question = public.mod_strip_words(question, p_words) where id = p_target;
  elsif p_kind = 'live' then update public.live_stream_comments set text = public.mod_strip_words(text, p_words) where id = p_target;
  elsif p_kind = 'room' then update public.noob_room_chat set text = public.mod_strip_words(text, p_words) where id = p_target;
  elsif p_kind = 'bio' then update public.profiles set bio = public.mod_strip_words(bio, p_words) where id = p_target;
  elsif p_kind = 'name' then
    select public.mod_strip_words(display_name, p_words) into new_name from public.profiles where id = p_target;
    update public.profiles set display_name = case when btrim(coalesce(new_name, '')) = '' then username else new_name end where id = p_target;
  end if;
end;
$$;
revoke execute on function public.mod_enforce(text, uuid, text, text[]) from public, anon, authenticated;

-- ============================================================================================================ claim (hands the Edge Function what to judge)
create or replace function public.mod_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.moderation_jobs; s public.moderation_settings; uname text; f jsonb; txt text; imgs text[];
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
  f := public.mod_fetch(j.kind, j.target_id);
  txt := f->>'text';
  imgs := coalesce((select array_agg(x) from jsonb_array_elements_text(f->'images') x), '{}');
  -- deleted meanwhile, or nothing to look at: done without asking the AI
  if not (f->>'found')::boolean or (length(btrim(coalesce(txt, ''))) < 2 and coalesce(array_length(imgs, 1), 0) = 0) then
    update public.moderation_jobs set status = 'skipped', finished_at = now() where id = j.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;
  return jsonb_build_object('claimed', true, 'jobId', j.id, 'kind', j.kind, 'userId', j.user_id, 'username', uname,
    'text', left(coalesce(txt, ''), 4000), 'images', to_jsonb(imgs), 'strictness', s.strictness, 'mode', s.mode);
end;
$$;
revoke execute on function public.mod_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.mod_claim(text, uuid) to service_role;

-- ============================================================================================================ apply (the enforcer)
create or replace function public.mod_apply(p_secret text, p_id uuid, p_verdict jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.moderation_jobs; s public.moderation_settings; v jsonb := coalesce(p_verdict, '{}'::jsonb); f jsonb;
  conf numeric; sev text; cat text; why text; words text[]; media_bad boolean; bad boolean; enforce boolean;
  uname text; content text := ''; media text[] := '{}'; act text;
  strikes integer := 0; susp boolean := false; lid uuid; admin_id uuid := public.noob_admin_id(); what text; msg text; ttl text; addr text; already boolean; stripped text;
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
  f := public.mod_fetch(j.kind, j.target_id);
  if not (f->>'found')::boolean then   -- it is gone already (the owner deleted it): nothing to enforce
    update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
    return jsonb_build_object('applied', false, 'gone', true);
  end if;
  content := left(coalesce(f->>'text', ''), 1000);
  media := coalesce((select array_agg(x) from jsonb_array_elements_text(f->'media') x), '{}');

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
  stripped := btrim(public.mod_strip_words(content, words));
  if j.kind in ('story', 'note') then   -- a picture / a one-line note can not be "edited": it goes
    act := 'deleted';
  elsif j.kind in ('post', 'reel', 'video', 'daily') then
    act := case when media_bad or sev in ('severe', 'critical') or cardinality(words) = 0 or (j.kind = 'video' and stripped = '') then 'deleted' else 'words_removed' end;
  elsif j.kind in ('comment', 'live', 'room') then
    act := case when media_bad or sev in ('severe', 'critical') or cardinality(words) = 0 or stripped = '' then 'deleted' else 'words_removed' end;
  elsif j.kind = 'poll' then
    act := case when media_bad or sev in ('severe', 'critical') or cardinality(words) = 0 or length(stripped) < 5 then 'deleted' else 'words_removed' end;
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
  perform public.mod_enforce(j.kind, j.target_id, act, words);

  -- the strike: this one counts too. The administrator can forgive any of them.
  insert into public.moderation_log (user_id, username, kind, target_id, content, media, category, severity, confidence, reason, words, action, applied, strike_limit)
  values (j.user_id, uname, j.kind, j.target_id, content, media, cat, sev, conf, why, words, act, true, s.strikes_to_suspend) returning id into lid;
  select count(*) into strikes from public.moderation_log
  where user_id = j.user_id and applied and not forgiven and action in ('deleted', 'words_removed') and created_at > now() - make_interval(days => s.strike_window_days);
  select is_suspended into already from public.profiles where id = j.user_id;
  susp := not coalesce(already, false) and (sev = 'critical' or strikes >= s.strikes_to_suspend);
  update public.moderation_log set strike_no = strikes, suspended = susp where id = lid;

  what := case j.kind when 'daily' then 'Daily NOOB entry' when 'live' then 'live comment' when 'room' then 'room message' when 'note' then 'status note'
                      when 'name' then 'display name' else j.kind end;
  if act = 'deleted' then
    ttl := '⚠️ Your ' || what || case when j.kind in ('bio', 'name') then ' was cleared' else ' was removed' end;
    msg := 'Your ' || what || case when j.kind in ('bio', 'name') then ' was cleared' else ' was removed' end || ' by NOOB Safety because ' || why;
  else
    ttl := '⚠️ Offensive language was removed';
    msg := 'Offensive language was removed from your ' || (case when j.kind in ('post', 'reel', 'daily') then what || ' caption' when j.kind = 'video' then 'video title or description' else what end) || ' by NOOB Safety. Reason: ' || why;
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

-- ============================================================================================================ the new places (only PUBLIC ones)
-- one trigger function for all of them: tg_argv = kind, the column that holds the author, the column that holds the id of the thing
create or replace function public.mod_trg_any() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  perform public.mod_enqueue(tg_argv[0], (j->>tg_argv[2])::uuid, (j->>tg_argv[1])::uuid);
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function public.mod_trg_any() from public, anon, authenticated;

do $$
declare g record;
begin
  for g in select * from (values
    ('stories', 'story', 'user_id', 'id', ''), ('long_videos', 'video', 'user_id', 'id', ''), ('daily_challenge_entries', 'daily', 'user_id', 'id', ''),
    ('polls', 'poll', 'creator_id', 'id', ''), ('live_stream_comments', 'live', 'sender_id', 'id', 'new.gift_amount is null'), ('noob_room_chat', 'room', 'sender_id', 'id', '')
  ) as t(tbl, kind, author, idcol, cond)
  loop
    if to_regclass('public.' || g.tbl) is not null then
      execute format('drop trigger if exists zz_moderate_any on public.%I', g.tbl);
      execute format('create trigger zz_moderate_any after insert on public.%I for each row %s execute function public.mod_trg_any(%L, %L, %L)',
                     g.tbl, case when g.cond <> '' then 'when (' || g.cond || ')' else '' end, g.kind, g.author, g.idcol);
    end if;
  end loop;
end;
$$;
-- a video whose title or description is edited is judged again; so is a new status note
drop trigger if exists zz_moderate_video_edit on public.long_videos;
create trigger zz_moderate_video_edit after update of title, description on public.long_videos for each row
  when (old.title is distinct from new.title or old.description is distinct from new.description) execute function public.mod_trg_any('video', 'user_id', 'id');
drop trigger if exists zz_moderate_note on public.profiles;
create trigger zz_moderate_note after update of status_note on public.profiles for each row
  when (new.status_note is not null and old.status_note is distinct from new.status_note) execute function public.mod_trg_any('note', 'id', 'id');

-- the e-mail: "what was removed" is shown for every kind of text (not for a bio / name / note / picture-only story)
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
    'snippet', case when l.action = 'deleted' and l.kind not in ('bio', 'name', 'note', 'story') then left(l.content, 140) else '' end);
end;
$$;
revoke execute on function public.mod_email_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.mod_email_claim(text, uuid) to service_role;

