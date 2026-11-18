-- Moves NOOB's hidden login addresses off a domain we no longer own.
-- Every password account has a made-up login address "<random>@users.nooob.xyz" (never emailed, only an internal ID). The public login helper hands that address back for a username, so if a stranger
-- bought nooob.xyz and ever received mail there, a password-reset email could reach them. They become "<random>@users.noobsocials.com" (a domain we own) here.
-- Safe by design: the login always asks the database for the address (so it follows the change), nothing else stores it, and the old addresses are kept in a backup table so this can be undone
-- (see the last lines). Both domains are recognised as "made-up address" meanwhile, so nothing that skips those addresses (receipts, moderation mail) changes.
-- Safe to run more than once. Run  select public.migrate_fake_login_emails();  again after the sign-up function (recover-account) is redeployed, to catch accounts made in between.

create or replace function public.is_fake_login_email(e text) returns boolean
language sql immutable as $$
  select lower(coalesce(e, '')) like '%@users.nooob.xyz' or lower(coalesce(e, '')) like '%@users.noobsocials.com';
$$;
grant execute on function public.is_fake_login_email(text) to anon, authenticated, service_role;

create table if not exists public.login_email_backup (
  user_id uuid primary key,
  old_email text not null,
  new_email text not null,
  moved_at timestamptz not null default now()
);
alter table public.login_email_backup enable row level security;
revoke all on public.login_email_backup from public, anon, authenticated;

-- the four functions that recognise a made-up address, now recognising both domains
create or replace function public.resolve_login_email(identifier text) returns text
language sql stable security definer set search_path = public
as $$
  with q as (
    select btrim(identifier) as raw,
           regexp_replace(btrim(identifier), '\D', '', 'g') as digits
  )
  select coalesce(
    -- 1. user ID or email: only an address that is made up for NOOB, or one that belongs to an account that has a password (so a Google account's real address is never given out)
    (
      select u.email
      from q, public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_private pp on pp.user_id = p.id
      where (lower(p.username) = lower(q.raw)
         or lower(pp.email) = lower(q.raw))
        and (public.is_fake_login_email(u.email) or coalesce(u.encrypted_password, '') <> '')
      order by p.created_at asc
      limit 1
    ),
    -- 2. mobile number
    (
      select u.email
      from q, public.profiles p
      join auth.users u on u.id = p.id
      join public.profile_private pp on pp.user_id = p.id
      where q.raw ~ '^[+(]?[0-9][0-9 ().-]{5,}$'
        and public.is_fake_login_email(u.email)
        and length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
        and (
          q.digits = regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')
          or q.digits = regexp_replace(coalesce(pp.country_code, ''), '\D', '', 'g') || regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')
          or (
            length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 10
            and right(q.digits, 10) = right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10)
          )
        )
      order by p.created_at asc
      limit 1
    ),
    -- 3. nothing matched: a well-formed decoy, so nobody can probe which accounts exist
    gen_random_uuid()::text || '@users.noobsocials.com'
  );
$$;

create or replace function public.email_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; e public.email_outbox; addr text; v_name text; v_user text; rel_user text; rel jsonb := null; rq record;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  update public.email_outbox set status = 'sending', attempts = attempts + 1, claimed_at = now()
  where id = p_id and attempts < 5 and (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
  returning * into e;
  if not found then return jsonb_build_object('claimed', false); end if;

  select lower(btrim(coalesce(pp.email, ''))) into addr from public.profile_private pp where pp.user_id = e.user_id;
  select coalesce(nullif(pr.display_name, ''), pr.username), pr.username into v_name, v_user from public.profiles pr where pr.id = e.user_id;
  if addr is null or addr = '' or position('@' in addr) = 0 or public.is_fake_login_email(addr) then
    update public.email_outbox set status = 'skipped', last_error = 'no real email address on this account' where id = e.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;

  -- the other person in this email (the friend who paid, the friend that was paid for, the admin who verified): name, User ID and account ID
  rel_user := nullif(lower(btrim(coalesce(e.payload->'paidBy'->>'username', e.payload->>'friend', e.payload->'by'->>'username', ''))), '');
  if rel_user is not null then
    select jsonb_build_object('id', p.id, 'username', p.username, 'name', coalesce(nullif(p.display_name, ''), p.username))
      into rel from public.profiles p where lower(p.username) = rel_user;
    if rel is not null and e.kind = 'pro_upgraded' and e.payload->'paidBy' is not null then
      select r.id, r.created_at into rq from public.payment_requests r
      where r.requester_id = e.user_id and r.payer_id = (rel->>'id')::uuid order by r.created_at desc limit 1;
      if found then rel := rel || jsonb_build_object('requestId', rq.id, 'requestedAt', rq.created_at); end if;
    end if;
  end if;

  return jsonb_build_object('claimed', true, 'id', e.id, 'kind', e.kind, 'payload', e.payload, 'email', addr, 'name', v_name, 'username', v_user,
                            'userId', e.user_id, 'related', rel);
end;
$$;

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
  update public.moderation_log set email_status = case when addr is null or addr = '' or position('@' in addr) = 0 or public.is_fake_login_email(addr) then 'skipped' else 'pending' end where id = lid;
  update public.moderation_jobs set status = 'done', finished_at = now() where id = j.id;
  return jsonb_build_object('applied', true, 'logId', lid, 'action', act, 'strike', strikes, 'suspended', susp,
    'emailPending', (select email_status = 'pending' from public.moderation_log where id = lid));
end;
$$;

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
  if addr is null or addr = '' or position('@' in addr) = 0 or public.is_fake_login_email(addr) then
    update public.moderation_log set email_status = 'skipped', email_error = 'no real e-mail address on this account' where id = l.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;
  return jsonb_build_object('claimed', true, 'logId', l.id, 'email', addr, 'name', v_name, 'username', l.username, 'kind', l.kind, 'action', l.action,
    'reason', l.reason, 'strike', l.strike_no, 'limit', l.strike_limit, 'suspended', l.suspended, 'severity', l.severity, 'createdAt', l.created_at,
    'snippet', case when l.action = 'deleted' and l.kind not in ('bio', 'name', 'note', 'story') then left(l.content, 140) else '' end);
end;
$$;

-- the move itself: login table + its identity rows, with the old address saved first. Only made-up addresses are touched (a real email is never changed).
create or replace function public.migrate_fake_login_emails() returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer := 0;
begin
  insert into public.login_email_backup (user_id, old_email, new_email)
    select u.id, u.email, replace(lower(u.email), '@users.nooob.xyz', '@users.noobsocials.com')
    from auth.users u where lower(u.email) like '%@users.nooob.xyz'
    on conflict (user_id) do nothing;
  if to_regclass('auth.identities') is not null then
    execute $q$
      update auth.identities i
        set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(replace(lower(i.identity_data->>'email'), '@users.nooob.xyz', '@users.noobsocials.com'))),
            provider_id = case when lower(i.provider_id) like '%@users.nooob.xyz' then replace(lower(i.provider_id), '@users.nooob.xyz', '@users.noobsocials.com') else i.provider_id end
        where lower(i.identity_data->>'email') like '%@users.nooob.xyz'
    $q$;
  end if;
  update auth.users u
    set email = replace(lower(u.email), '@users.nooob.xyz', '@users.noobsocials.com')
    where lower(u.email) like '%@users.nooob.xyz';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.migrate_fake_login_emails() from public, anon, authenticated;
grant execute on function public.migrate_fake_login_emails() to service_role;

select public.migrate_fake_login_emails() as accounts_moved;

-- To UNDO (only if something unexpected happens): 
--   update auth.users u set email = b.old_email from public.login_email_backup b where b.user_id = u.id;
--   update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(b.old_email)), provider_id = case when i.provider_id = b.new_email then b.old_email else i.provider_id end from public.login_email_backup b where i.user_id = b.user_id and i.provider = 'email';
