-- NOOB - "Settings and activity": the choices of an account that the SERVER enforces.
--
-- What this adds (everything is safe to run again, and nothing changes for an account that has not changed a setting: every default is "as it always was"):
--   1. user_settings (one row per account) and user_lists (restricted, muted, favourites, blocked commenters, "hide my story from"): only reachable through the functions below.
--   2. my_settings / set_my_settings: reads and saves the settings, refusing anything that is not a known setting with an allowed value.
--   3. Notifications: each kind can be switched off, all can be paused for a while (checked where a notification is created); quiet hours hold the phone alert (push).
--   4. Comments (posts, reels, videos): who may comment, comments from blocked / restricted / limited people and comments with hidden words are hidden from everyone but their
--      author, @mentions follow "who can mention you" and tell the person mentioned.
--   5. Messages: who may start a new chat with you, who may reply to your story, read receipts, and sharing your posts into messages.
--   6. Tags: who may tag you in a post or reel (or invite you as a collaborator).
--   7. Story: "hide my story from" people really hides it.   8. Like counts: "hide on all my posts".
--   9. Lists the settings pages show: my comments, my stories archive, my account status.

-- ====================================================================================================================================== 1. storage
create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;     -- only the functions below touch it

create table if not exists public.user_lists (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('restricted', 'muted', 'favourite', 'comment_block', 'story_hide')),
  target_id  uuid not null references public.profiles (id) on delete cascade,
  extra      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id),
  check (user_id <> target_id)
);
create index if not exists user_lists_target_idx on public.user_lists (target_id, kind);
alter table public.user_lists enable row level security;
revoke all on public.user_lists from anon, authenticated;

alter table public.comments add column if not exists hidden_reason text;     -- null = shown to everyone; otherwise shown only to its author

-- ====================================================================================================================================== 2. the list of settings
create or replace function public.settings_defaults() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'notif.pauseUntil', null, 'notif.likes', true, 'notif.comments', true, 'notif.follows', true, 'notif.messages', true, 'notif.mentions', true,
    'notif.live', true, 'notif.games', true, 'notif.points', true, 'notif.suggestions', true, 'notif.birthdays', true,
    'notif.quiet', jsonb_build_object('on', false, 'from', '23:00', 'to', '07:00', 'tz', 0),
    'msg.who', 'connected', 'msg.storyReplies', 'everyone', 'msg.readReceipts', true,
    'activity.status', true,
    'tags.who', 'everyone', 'mentions.who', 'everyone',
    'comments.who', 'everyone', 'comments.hideOffensive', false,
    'share.toMessages', true,
    'limit.until', null, 'limit.audience', 'non_followers',
    'likes.hideOthers', false, 'likes.hideMine', false);
$$;

create or replace function public.settings_enums() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'msg.who', jsonb_build_array('connected', 'following', 'nobody'),
    'msg.storyReplies', jsonb_build_array('everyone', 'following', 'off'),
    'tags.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'mentions.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'comments.who', jsonb_build_array('everyone', 'followers', 'following', 'both', 'off'),
    'limit.audience', jsonb_build_array('non_followers', 'recent_followers'));
$$;

-- small helpers the rules below use (not offered to the app)
create or replace function public.setting_json(p_user uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select prefs -> p_key from public.user_settings where user_id = p_user), public.settings_defaults() -> p_key);
$$;
create or replace function public.setting_bool(p_user uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.setting_json(p_user, p_key) = 'true'::jsonb, false);
$$;
create or replace function public.setting_text(p_user uuid, p_key text) returns text
language sql stable security definer set search_path = public as $$
  select public.setting_json(p_user, p_key) #>> '{}';
$$;
create or replace function public.follows_user(p_follower uuid, p_followee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows f where f.follower_id = p_follower and f.followee_id = p_followee);
$$;
create or replace function public.is_admin_id(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user), false);
$$;
create or replace function public.list_has(p_owner uuid, p_kind text, p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_lists l where l.user_id = p_owner and l.kind = p_kind and l.target_id = p_target);
$$;
-- "Limit interactions" is switched on for p_owner and p_other is one of the people it limits
create or replace function public.limit_applies(p_owner uuid, p_other uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare until timestamptz; audience text; since timestamptz;
begin
  if public.is_admin_id(p_other) then return false; end if;
  begin until := (public.setting_json(p_owner, 'limit.until') #>> '{}')::timestamptz; exception when others then until := null; end;
  if until is null or until <= now() then return false; end if;
  audience := public.setting_text(p_owner, 'limit.audience');
  select f.created_at into since from public.follows f where f.follower_id = p_other and f.followee_id = p_owner;
  if since is null then return true; end if;                                       -- not a follower: always limited
  return audience = 'recent_followers' and since > now() - interval '7 days';       -- a very new follower: limited only if chosen
end;
$$;
create or replace function public.reads_receipts_on(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.setting_bool(p_user, 'msg.readReceipts');
$$;
create or replace function public.in_quiet_hours(p_user uuid, p_at timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare q jsonb := public.setting_json(p_user, 'notif.quiet'); f int; t int; cur int; tz int;
begin
  if q is null or jsonb_typeof(q) <> 'object' or coalesce((q ->> 'on')::boolean, false) is not true then return false; end if;
  f := split_part(q ->> 'from', ':', 1)::int * 60 + split_part(q ->> 'from', ':', 2)::int;
  t := split_part(q ->> 'to', ':', 1)::int * 60 + split_part(q ->> 'to', ':', 2)::int;
  tz := coalesce((q ->> 'tz')::int, 0);
  cur := (((extract(hour from (p_at at time zone 'UTC'))::int * 60 + extract(minute from (p_at at time zone 'UTC'))::int + tz) % 1440) + 1440) % 1440;
  if f = t then return false; end if;
  return case when f < t then cur >= f and cur < t else cur >= f or cur < t end;
exception when others then
  return false;
end;
$$;
revoke execute on function public.setting_json(uuid, text), public.setting_bool(uuid, text), public.setting_text(uuid, text), public.follows_user(uuid, uuid),
  public.is_admin_id(uuid), public.list_has(uuid, text, uuid), public.limit_applies(uuid, uuid), public.in_quiet_hours(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.reads_receipts_on(uuid) from public, anon;
grant execute on function public.reads_receipts_on(uuid) to authenticated;     -- message_json (which runs as the person asking) needs it

create or replace function public.my_settings() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'settings', public.settings_defaults() || coalesce((select prefs from public.user_settings where user_id = me), '{}'::jsonb),
    'counts', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select l.kind, count(*)::int as n from public.user_lists l where l.user_id = me group by l.kind) x));
end;
$$;
revoke execute on function public.my_settings() from public, anon;
grant execute on function public.my_settings() to authenticated;

create or replace function public.set_my_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); k text; v jsonb; defs jsonb := public.settings_defaults(); enums jsonb := public.settings_enums();
  clean jsonb := '{}'::jsonb; ts timestamptz; q jsonb; max_days int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Nothing to save.'; end if;
  for k, v in select * from jsonb_each(p) loop
    if not defs ? k then raise exception 'That is not a setting.'; end if;
    if k in ('notif.pauseUntil', 'limit.until') then
      if jsonb_typeof(v) = 'null' then
        clean := clean || jsonb_build_object(k, 'null'::jsonb);
      elsif jsonb_typeof(v) = 'string' then
        begin ts := (v #>> '{}')::timestamptz; exception when others then raise exception 'That is not a valid date.'; end;
        max_days := case when k = 'limit.until' then 40 else 400 end;
        if ts > now() + make_interval(days => max_days) then raise exception 'That is too far ahead.'; end if;
        clean := clean || jsonb_build_object(k, to_jsonb(ts));
      else
        raise exception 'That is not a valid date.';
      end if;
    elsif k = 'notif.quiet' then
      if jsonb_typeof(v) <> 'object' then raise exception 'Quiet hours are not valid.'; end if;
      if jsonb_typeof(v -> 'on') <> 'boolean' or coalesce(v ->> 'from', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v ->> 'to', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(v ->> 'tz', 'x') !~ '^-?[0-9]{1,4}$' or abs((v ->> 'tz')::int) > 840 then
        raise exception 'Quiet hours are not valid.';
      end if;
      clean := clean || jsonb_build_object(k, jsonb_build_object('on', (v ->> 'on')::boolean, 'from', v ->> 'from', 'to', v ->> 'to', 'tz', (v ->> 'tz')::int));
    elsif enums ? k then
      if jsonb_typeof(v) <> 'string' or not (enums -> k) @> jsonb_build_array(v #>> '{}') then raise exception 'That choice is not allowed.'; end if;
      clean := clean || jsonb_build_object(k, v);
    else
      if jsonb_typeof(v) <> jsonb_typeof(defs -> k) then raise exception 'That value is not valid.'; end if;
      clean := clean || jsonb_build_object(k, v);
    end if;
  end loop;

  insert into public.user_settings (user_id, prefs) values (me, clean)
  on conflict (user_id) do update set prefs = public.user_settings.prefs || excluded.prefs, updated_at = now();

  -- "Hide like and share counts" on all my posts and reels
  if clean ? 'likes.hideMine' then
    update public.posts set is_like_count_hidden = (clean ->> 'likes.hideMine')::boolean where user_id = me and is_like_count_hidden is distinct from (clean ->> 'likes.hideMine')::boolean;
    update public.reels set is_like_count_hidden = (clean ->> 'likes.hideMine')::boolean where user_id = me and is_like_count_hidden is distinct from (clean ->> 'likes.hideMine')::boolean;
  end if;

  return jsonb_build_object('settings', public.settings_defaults() || coalesce((select prefs from public.user_settings where user_id = me), '{}'::jsonb));
end;
$$;
revoke execute on function public.set_my_settings(jsonb) from public, anon;
grant execute on function public.set_my_settings(jsonb) to authenticated;

-- the lists of people
create or replace function public.settings_list(p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_kind not in ('restricted', 'muted', 'favourite', 'comment_block', 'story_hide') then raise exception 'That list does not exist.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified,
      'mutePosts', coalesce((l.extra ->> 'posts')::boolean, true), 'muteStories', coalesce((l.extra ->> 'stories')::boolean, true), 'since', l.created_at
    ) order by l.created_at desc), '[]'::jsonb)
    from public.user_lists l join public.profiles p on p.id = l.target_id
    where l.user_id = me and l.kind = p_kind and not p.is_suspended);
end;
$$;

create or replace function public.settings_list_add(p_kind text, p_user uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cap int; n int; ex jsonb := '{}'::jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_kind not in ('restricted', 'muted', 'favourite', 'comment_block', 'story_hide') then raise exception 'That list does not exist.'; end if;
  if p_user is null or p_user = me then raise exception 'You cannot add yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and not is_suspended and not is_ai) then raise exception 'That account was not found.'; end if;
  cap := case p_kind when 'favourite' then 100 else 500 end;
  select count(*) into n from public.user_lists where user_id = me and kind = p_kind;
  if n >= cap and not exists (select 1 from public.user_lists where user_id = me and kind = p_kind and target_id = p_user) then
    raise exception 'The list is full (%). Remove someone first.', cap;
  end if;
  if p_kind = 'muted' then
    ex := jsonb_build_object('posts', coalesce((p_extra ->> 'posts')::boolean, true), 'stories', coalesce((p_extra ->> 'stories')::boolean, true));
    if ex ->> 'posts' = 'false' and ex ->> 'stories' = 'false' then raise exception 'Choose posts, stories or both to mute.'; end if;
  end if;
  insert into public.user_lists (user_id, kind, target_id, extra) values (me, p_kind, p_user, ex)
  on conflict (user_id, kind, target_id) do update set extra = excluded.extra;
  return jsonb_build_object('success', true, 'count', (select count(*) from public.user_lists where user_id = me and kind = p_kind));
end;
$$;

create or replace function public.settings_list_remove(p_kind text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.user_lists where user_id = me and kind = p_kind and target_id = p_user;
  return jsonb_build_object('success', true, 'count', (select count(*) from public.user_lists where user_id = me and kind = p_kind));
end;
$$;
revoke execute on function public.settings_list(text), public.settings_list_add(text, uuid, jsonb), public.settings_list_remove(text, uuid) from public, anon;
grant execute on function public.settings_list(text), public.settings_list_add(text, uuid, jsonb), public.settings_list_remove(text, uuid) to authenticated;

-- ====================================================================================================================================== 3. notifications
create or replace function public.notifications_prefs() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; until timestamptz;
begin
  if new.target_user_id is null then return new; end if;                      -- a message to everyone is not filtered
  k := case new.type
    when 'post_like' then 'notif.likes' when 'reel_like' then 'notif.likes'
    when 'post_comment' then 'notif.comments'
    when 'new_follower' then 'notif.follows' when 'follow_request_received' then 'notif.follows' when 'follow_request_accepted' then 'notif.follows'
    when 'new_message' then 'notif.messages' when 'instant' then 'notif.messages' when 'instant_reaction' then 'notif.messages'
    when 'mention' then 'notif.mentions'
    when 'live_lounge_invite' then 'notif.live' when 'live_lounge_meeting' then 'notif.live' when 'live_gift' then 'notif.live'
    when 'game_challenge' then 'notif.games' when 'noob_draw_ready' then 'notif.games'
    when 'points_transfer' then 'notif.points' when 'payment_request' then 'notif.points' when 'payment_request_approved' then 'notif.points' when 'payment_request_declined' then 'notif.points'
    when 'suggested_user' then 'notif.suggestions'
    when 'birthday_follower_alert' then 'notif.birthdays' when 'birthday_wish' then 'notif.birthdays'
    else null end;
  if k is null then return new; end if;                                       -- messages from the team, orders, calls and safety notices always arrive
  if not public.setting_bool(new.target_user_id, k) then return null; end if;
  begin until := (public.setting_json(new.target_user_id, 'notif.pauseUntil') #>> '{}')::timestamptz; exception when others then until := null; end;
  if until is not null and until > now() then return null; end if;
  return new;
end;
$$;
revoke execute on function public.notifications_prefs() from public, anon, authenticated;
drop trigger if exists notifications_prefs on public.notifications;
create trigger notifications_prefs before insert on public.notifications for each row execute function public.notifications_prefs();


-- Quiet hours: the notification is kept in the app, only the alert on the phone is held back.
create or replace function public.push_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; n public.notifications; who text; subs jsonb;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  update public.notifications set push_sent_at = now() where id = p_id and push_sent_at is null returning * into n;
  if not found then return jsonb_build_object('claimed', false); end if;
  select username into who from public.profiles where id = n.actor_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'subscription', s.subscription)), '[]'::jsonb) into subs
  from public.push_subscriptions s join public.profiles pr on pr.id = s.user_id
  where not pr.is_suspended
    and (n.target_user_id is null or s.user_id = n.target_user_id)
    and s.user_id is distinct from n.actor_id
    and not public.in_quiet_hours(s.user_id, now())
    and not (n.type <> 'call_ring' and n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted));
  return jsonb_build_object(
    'claimed', true,
    'type', n.type,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'data', n.data,
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;


-- ====================================================================================================================================== 4. comments
-- Words that are hidden when "Hide offensive comments" is on: common insults and threats (whole words only).
create or replace function public.offensive_pattern() returns text language sql immutable as $$
  select '\m(idiot|idiots|moron|morons|stupid|dumb|dumbass|loser|losers|ugly|trash|garbage|shut up|kys|kill yourself|go die|i hate you|hate you|pathetic|worthless|useless|scum|bastard|bitch|asshole|bullshit|fuck|fucking|shit)\M';
$$;
create or replace function public.words_pattern(p_words text[]) returns text
language sql immutable as $$
  select case when p_words is null or cardinality(p_words) = 0 then null
              else '\m(' || (select string_agg(regexp_replace(lower(btrim(w)), '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '|') from unnest(p_words) w where btrim(w) <> '') || ')\M' end;
$$;

create or replace function public.comments_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid; who text; txt text := coalesce(new.text, ''); hidden text := null; custom text[]; pat text; h text; mentioned uuid; mm text[]; mwho text;
begin
  owner := coalesce((select user_id from public.posts where id = new.post_id), (select user_id from public.reels where id = new.reel_id), (select user_id from public.long_videos where id = new.long_video_id));
  if public.is_admin_id(new.user_id) then return new; end if;

  -- who may be mentioned (checked even on my own content)
  if txt <> '' then
    for mm in select regexp_matches(lower(txt), '@([a-z0-9_.]{2,30})', 'g') loop
      select id into mentioned from public.profiles where lower(username) = mm[1];
      if mentioned is null or mentioned = new.user_id then continue; end if;
      mwho := public.setting_text(mentioned, 'mentions.who');
      if mwho = 'nobody' or (mwho = 'following' and not public.follows_user(mentioned, new.user_id)) then
        raise exception 'You cannot mention @% because of their settings.', mm[1] using errcode = '42501';
      end if;
    end loop;
  end if;

  if owner is null or owner = new.user_id then return new; end if;

  who := public.setting_text(owner, 'comments.who');
  if who = 'off' then raise exception 'Comments are turned off on this account.' using errcode = '42501'; end if;
  if who = 'followers' and not public.follows_user(new.user_id, owner) then raise exception 'Only followers of this account can comment.' using errcode = '42501'; end if;
  if who = 'following' and not public.follows_user(owner, new.user_id) then raise exception 'Only people this account follows can comment.' using errcode = '42501'; end if;
  if who = 'both' and not (public.follows_user(new.user_id, owner) or public.follows_user(owner, new.user_id)) then
    raise exception 'Only followers and people this account follows can comment.' using errcode = '42501';
  end if;

  if public.list_has(owner, 'comment_block', new.user_id) then hidden := 'blocked';
  elsif public.list_has(owner, 'restricted', new.user_id) then hidden := 'restricted';
  elsif public.limit_applies(owner, new.user_id) then hidden := 'limited';
  elsif txt <> '' then
    select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(pr.privacy_settings -> 'blockedWords') = 'array' then pr.privacy_settings -> 'blockedWords' else '[]'::jsonb end)), '{}') into custom
      from public.profiles pr where pr.id = owner;
    pat := public.words_pattern(custom);
    if pat is not null and lower(txt) ~ pat then hidden := 'words';
    elsif public.setting_bool(owner, 'comments.hideOffensive') and lower(txt) ~ public.offensive_pattern() then hidden := 'offensive';
    end if;
  end if;
  new.hidden_reason := hidden;
  return new;
end;
$$;
revoke execute on function public.comments_rules(), public.offensive_pattern(), public.words_pattern(text[]) from public, anon, authenticated;
drop trigger if exists comments_rules on public.comments;
create trigger comments_rules before insert on public.comments for each row execute function public.comments_rules();

-- Someone who was @mentioned in a comment that is shown is told (their own "Mentions" notification setting is applied where the notification is made).
create or replace function public.comments_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; mm text[]; mentioned uuid; seen uuid[] := '{}';
begin
  if new.hidden_reason is not null or coalesce(new.text, '') = '' then return null; end if;
  owner := coalesce((select user_id from public.posts where id = new.post_id), (select user_id from public.reels where id = new.reel_id), (select user_id from public.long_videos where id = new.long_video_id));
  for mm in select regexp_matches(lower(new.text), '@([a-z0-9_.]{2,30})', 'g') loop
    select id into mentioned from public.profiles where lower(username) = mm[1] and not is_suspended;
    if mentioned is null or mentioned = new.user_id or mentioned = any (seen) or mentioned is not distinct from owner then continue; end if;
    seen := seen || mentioned;
    perform public.notify_user(mentioned, 'mention', new.user_id, 'mentioned you in a comment: "' || left(new.text, 80) || '"', null, new.post_id, new.reel_id);
  end loop;
  return null;
exception when others then
  return null;                                  -- a notification problem must never stop a comment
end;
$$;
revoke execute on function public.comments_mentions() from public, anon, authenticated;
drop trigger if exists comments_mentions on public.comments;
create trigger comments_mentions after insert on public.comments for each row execute function public.comments_mentions();

-- The lists of comments show a hidden comment only to the person who wrote it.

create or replace function public.post_comments(p_post uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.post_id = p_post and (c.hidden_reason is null or c.user_id = auth.uid());
$$;

create or replace function public.reel_comments(p_reel uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.reel_id = p_reel and (c.hidden_reason is null or c.user_id = auth.uid());
$$;

create or replace function public.long_video_comments(p_video uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.long_video_id = p_video and (c.hidden_reason is null or c.user_id = auth.uid());
$$;


create or replace function public.notifications_hidden_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'post_comment' and new.actor_id is not null and exists (
       select 1 from public.comments c
       where c.user_id = new.actor_id and c.hidden_reason is not null and c.created_at >= now()
         and (c.post_id is not distinct from new.post_id and new.post_id is not null or c.reel_id is not distinct from new.reel_id and new.reel_id is not null)) then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.notifications_hidden_comment() from public, anon, authenticated;
drop trigger if exists notifications_hidden_comment on public.notifications;
create trigger notifications_hidden_comment before insert on public.notifications for each row execute function public.notifications_hidden_comment();

-- ====================================================================================================================================== 5. messages and story replies
-- May `p_sender` start a NEW chat with `p_recipient`? (Chats that already exist carry on. The NOOB team is never limited.)
create or replace function public.assert_can_start_chat(p_sender uuid, p_recipient uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare who text;
begin
  if p_recipient is null or p_sender is null or p_recipient = p_sender or public.is_admin_id(p_sender) then return; end if;
  who := public.setting_text(p_recipient, 'msg.who');
  if who = 'nobody' or (who = 'following' and not public.follows_user(p_recipient, p_sender)) or public.limit_applies(p_recipient, p_sender) then
    raise exception 'This person is not taking new messages from you.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_can_start_chat(uuid, uuid) from public, anon, authenticated;

-- create_chat: the same function as before, plus the "who can message me" check when a NEW one-to-one chat is started.
create or replace function public.create_chat(
  p_participant_ids uuid[], p_is_group boolean default false, p_name text default null,
  p_avatar text default null, p_description text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ids uuid[]; existing uuid; cid uuid; u uuid;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct p.id), '{}') into ids from public.profiles p where p.id = any(coalesce(p_participant_ids, '{}') || me);

  if not coalesce(p_is_group, false) then
    if cardinality(ids) < 2 then raise exception 'Could not find the other participant to start this chat.'; end if;
    if exists (select 1 from public.blocks b where b.blocker_id = any(ids) and b.blocked_id = any(ids)) then
      raise exception 'You can''t message this person.' using errcode = '42501';
    end if;
    -- reuse the existing 1:1 chat between the same two people
    select c.id into existing from public.chats c
    where not c.is_group and not c.is_global_default
      and (select array_agg(m.user_id order by m.user_id) from public.chat_members m where m.chat_id = c.id)
        = (select array_agg(x order by x) from unnest(ids) x)
    limit 1;
    if existing is not null then
      return jsonb_build_object('success', true, 'chat', (select public.chat_json(c) from public.chats c where c.id = existing));
    end if;
  end if;

  if not coalesce(p_is_group, false) then
    perform public.assert_can_start_chat(me, (select pid from unnest(ids) pid where pid <> me limit 1));
  end if;

  insert into public.chats (name, avatar, description, is_group, creator_id)
  values (case when p_is_group then coalesce(nullif(btrim(p_name), ''), 'Group Chat') else null end,
          case when p_is_group then coalesce(nullif(p_avatar, ''), '/noob-logo-circle.png') else null end,
          nullif(p_description, ''), coalesce(p_is_group, false), case when p_is_group then me else null end)
  returning id into cid;
  foreach u in array ids loop
    insert into public.chat_members (chat_id, user_id, is_admin) values (cid, u, coalesce(p_is_group, false) and u = me);
  end loop;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(c) from public.chats c where c.id = cid));
end;
$$;


-- Sharing a post, reel or video into a chat: the owner may have switched that off.
create or replace function public.messages_share_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; kind text;
begin
  if new.shared_post is null or new.sender_id is null or public.is_admin_id(new.sender_id) then return new; end if;
  kind := new.shared_post ->> 'type';
  begin
    owner := case kind
      when 'post' then (select user_id from public.posts where id = (new.shared_post ->> 'id')::uuid)
      when 'reel' then (select user_id from public.reels where id = (new.shared_post ->> 'id')::uuid)
      when 'video' then (select user_id from public.long_videos where id = (new.shared_post ->> 'id')::uuid)
      else null end;
  exception when others then owner := null;
  end;
  if owner is not null and owner <> new.sender_id and not public.setting_bool(owner, 'share.toMessages') then
    raise exception 'The owner has turned off sharing this in messages.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_share_rules() from public, anon, authenticated;
drop trigger if exists messages_share_rules on public.messages;
create trigger messages_share_rules before insert on public.messages for each row execute function public.messages_share_rules();

-- Replies to a story
create or replace function public.story_replies_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; who text;
begin
  select user_id into owner from public.stories where id = new.story_id;
  if owner is null or owner = new.user_id or public.is_admin_id(new.user_id) then return new; end if;
  who := public.setting_text(owner, 'msg.storyReplies');
  if who = 'off' then raise exception 'Replies are turned off for this story.' using errcode = '42501'; end if;
  if who = 'following' and not public.follows_user(owner, new.user_id) then raise exception 'Only people this account follows can reply to the story.' using errcode = '42501'; end if;
  if public.limit_applies(owner, new.user_id) then raise exception 'This account has limited who can reply right now.' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke execute on function public.story_replies_rules() from public, anon, authenticated;
drop trigger if exists story_replies_rules on public.story_comments;
create trigger story_replies_rules before insert on public.story_comments for each row execute function public.story_replies_rules();

-- message_json: the same as before, but "read" (blue ticks) is not shown for a person who turned read receipts off.
create or replace function public.message_json(m public.messages) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'chatId', m.chat_id, 'senderId', coalesce(m.sender_id::text, 'system'),
    'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'text', m.text, 'mediaUrl', m.media_url, 'mediaType', coalesce(m.media_type, 'text'), 'audioDuration', m.audio_duration,
    'sharedTrack', m.shared_track, 'gameInvite', m.game_invite, 'sharedProfile', m.shared_profile, 'sharedPost', m.shared_post,
    'replyTo', m.reply_to,
    'createdAt', m.created_at, 'isEdited', m.is_edited, 'isPinned', m.is_pinned, 'reactions', m.reactions,
    'scheduledAt', m.scheduled_at, 'e2ee', m.e2ee,
    -- "read" (blue ticks) once anyone else in the chat has opened it since this was sent
    'status', case when m.sender_id = auth.uid()
                   then case when exists (select 1 from public.chat_members cm
                                          where cm.chat_id = m.chat_id and cm.user_id <> m.sender_id and cm.last_read_at >= m.created_at and public.reads_receipts_on(cm.user_id))
                             then 'read' else 'sent' end
                   else 'read' end)
  from (select 1) v left join public.profiles a on a.id = m.sender_id;
$$;


-- ====================================================================================================================================== 6. tags, 7. stories, 8. like counts
create or replace function public.filter_tags(p_poster uuid, p_tags jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; e jsonb; uid uuid; who text;
begin
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' then return coalesce(p_tags, '[]'::jsonb); end if;
  if public.is_admin_id(p_poster) then return p_tags; end if;
  for e in select * from jsonb_array_elements(p_tags) loop
    begin uid := nullif(e ->> 'userId', '')::uuid; exception when others then uid := null; end;
    if uid is null and nullif(e ->> 'username', '') is not null then select id into uid from public.profiles where lower(username) = lower(e ->> 'username'); end if;
    if uid is not null and uid <> p_poster then
      who := public.setting_text(uid, 'tags.who');
      if who = 'nobody' or (who = 'following' and not public.follows_user(uid, p_poster)) then continue; end if;
    end if;
    res := res || jsonb_build_array(e);
  end loop;
  return res;
end;
$$;
create or replace function public.tag_allowed(p_poster uuid, p_username text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; who text;
begin
  if p_username is null or public.is_admin_id(p_poster) then return true; end if;
  select id into uid from public.profiles where lower(username) = lower(p_username);
  if uid is null or uid = p_poster then return true; end if;
  who := public.setting_text(uid, 'tags.who');
  return not (who = 'nobody' or (who = 'following' and not public.follows_user(uid, p_poster)));
end;
$$;
revoke execute on function public.filter_tags(uuid, jsonb), public.tag_allowed(uuid, text) from public, anon, authenticated;

create or replace function public.posts_tag_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tagged_users := public.filter_tags(new.user_id, new.tagged_users);
  if new.collab_username is not null and not public.tag_allowed(new.user_id, new.collab_username) then
    new.collab_username := null; new.is_collab := false;
  end if;
  return new;
end;
$$;
create or replace function public.slides_tag_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tagged_users := public.filter_tags((select user_id from public.posts where id = new.post_id), new.tagged_users);
  return new;
end;
$$;
create or replace function public.reels_tag_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.tagged_users := public.filter_tags(new.user_id, new.tagged_users);
  return new;
end;
$$;
revoke execute on function public.posts_tag_rules(), public.slides_tag_rules(), public.reels_tag_rules() from public, anon, authenticated;
drop trigger if exists posts_tag_rules on public.posts;
create trigger posts_tag_rules before insert or update of tagged_users, collab_username on public.posts for each row execute function public.posts_tag_rules();
drop trigger if exists slides_tag_rules on public.post_slides;
create trigger slides_tag_rules before insert or update of tagged_users on public.post_slides for each row execute function public.slides_tag_rules();
drop trigger if exists reels_tag_rules on public.reels;
create trigger reels_tag_rules before insert or update of tagged_users on public.reels for each row execute function public.reels_tag_rules();

-- "Hide like and share counts" for new posts and reels too
create or replace function public.new_content_like_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.setting_bool(new.user_id, 'likes.hideMine') then new.is_like_count_hidden := true; end if;
  return new;
end;
$$;
revoke execute on function public.new_content_like_counts() from public, anon, authenticated;
drop trigger if exists new_content_like_counts on public.posts;
create trigger new_content_like_counts before insert on public.posts for each row execute function public.new_content_like_counts();
drop trigger if exists new_content_like_counts on public.reels;
create trigger new_content_like_counts before insert on public.reels for each row execute function public.new_content_like_counts();


-- home_story_tray: the same as before, plus "hide my story from" people really hides it.
create or replace function public.home_story_tray() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or coalesce((select is_suspended from public.profiles where id = me), true) then
    return jsonb_build_object('stories', '[]'::jsonb, 'suggestions', '[]'::jsonb);
  end if;

  return (
    with vis as (
      select st.id, st.user_id, st.created_at,
             exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = st.user_id) as followed
      from public.stories st
      join public.profiles p on p.id = st.user_id
      where st.expires_at > now()
        and not p.is_suspended
        and (
          st.user_id = me
          or (
            public.can_view_author(st.user_id)
            and not public.list_has(st.user_id, 'story_hide', me)
            and (
              p.account_type in ('public', 'business')
              or exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = st.user_id)
            )
            and (
              not st.is_close_friends_only
              or exists (select 1 from public.close_friends c where c.owner_id = st.user_id and c.friend_id = me)
            )
          )
        )
    ),
    top_authors as (
      select v.user_id from vis v
      group by v.user_id
      order by (v.user_id = me) desc, bool_or(v.followed) desc, max(v.created_at) desc
      limit 60
    ),
    sug as (
      select p.id, p.username, p.display_name, p.avatar, p.is_verified, p.account_type, random() as r
      from public.profiles p
      where p.id <> me
        and not p.is_suspended
        and not p.is_ai
        and p.account_type in ('public', 'business')
        and not exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p.id)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = me and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = me)
        )
        and not exists (select 1 from public.profile_hides h where h.owner_id = p.id and h.hidden_from_id = me)
        and not exists (select 1 from vis v where v.user_id = p.id)
      order by r
      limit 10
    )
    select jsonb_build_object(
      'stories', coalesce((
        select jsonb_agg(public.story_json(s) order by s.created_at desc)
        from public.stories s
        where s.id in (select v.id from vis v where v.user_id in (select user_id from top_authors))
      ), '[]'::jsonb),
      'suggestions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar,
          'isVerified', x.is_verified, 'accountType', x.account_type) order by x.r)
        from sug x
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.story_by_id(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.stories where id = p_story;
  if owner is null then return null; end if;
  if owner is distinct from auth.uid() and (not public.can_view_author(owner) or public.list_has(owner, 'story_hide', auth.uid())) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  return (select public.story_json(s) from public.stories s where s.id = p_story);
end;
$$;


-- ====================================================================================================================================== 9. what the settings pages list
create or replace function public.my_comments() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'kind', case when c.post_id is not null then 'post' when c.reel_id is not null then 'reel' else 'video' end,
      'targetId', coalesce(c.post_id, c.reel_id, c.long_video_id),
      'text', coalesce(nullif(c.text, ''), case when c.media_type is not null then '[' || c.media_type || ']' else '' end),
      'createdAt', c.created_at,
      'targetPreview', coalesce((select left(p.caption, 60) from public.posts p where p.id = c.post_id), (select left(r.caption, 60) from public.reels r where r.id = c.reel_id),
                                (select left(v.title, 60) from public.long_videos v where v.id = c.long_video_id), '')
    ) order by c.created_at desc), '[]'::jsonb)
    from (select * from public.comments x where x.user_id = me order by x.created_at desc limit 200) c);
end;
$$;

create or replace function public.my_stories_archive() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'mediaUrl', s.media_url, 'mediaType', s.media_type, 'createdAt', s.created_at,
      'viewsCount', (select count(*) from public.story_views v where v.story_id = s.id)
    ) order by s.created_at desc), '[]'::jsonb)
    from (select * from public.stories x where x.user_id = me order by x.created_at desc limit 300) s);
end;
$$;

create or replace function public.my_account_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into p from public.profiles where id = me;
  return jsonb_build_object(
    'standing', case when p.is_suspended then 'suspended' else 'good' end,
    'reason', (select pp.suspended_reason from public.profile_private pp where pp.user_id = me),
    'reportsAgainstHandled', (select count(*) from public.reports r where r.target_id = me and r.status in ('resolved', 'banned')),
    'memberSince', p.created_at,
    'lastLogin', (select max(h.logged_in_at) from public.login_history h where h.user_id = me));
end;
$$;
revoke execute on function public.my_comments(), public.my_stories_archive(), public.my_account_status() from public, anon;
grant execute on function public.my_comments(), public.my_stories_archive(), public.my_account_status() to authenticated;
