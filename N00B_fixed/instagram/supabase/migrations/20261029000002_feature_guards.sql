-- NOOB — the administrator's Pages switches now also stop the work on the SERVER, not only on the screen.
-- Until now a switched-off page only disappeared from the app (an old tab, an old Android app or a clever visitor could still use it, and every use costs database / storage / live-call
-- minutes). From now on, when a page is switched off (Admin Control Panel -> Pages), the database itself refuses the NEW things people make in it: a new live stream, a room, a meeting,
-- a game table, a form or an answer to one, a poll vote, a question, an order ... The main administrator is never blocked. Switching the page on again brings everything back; nothing is
-- deleted. Safe to run more than once.

-- true when the page is switched off for the person asking (the main administrator is never blocked)
create or replace function public.feature_blocked(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select lower(btrim(coalesce(p_key, ''))) = any (coalesce(s.disabled_features, '{}'::text[])) from public.platform_settings s where s.id = true), false)
         and not (auth.uid() is not null and public.is_master_admin());
$$;
revoke execute on function public.feature_blocked(text) from public, anon;
grant execute on function public.feature_blocked(text) to authenticated;

-- the guard on a table: tg_argv[0] = the page key; tg_argv[1] = 'anon' when visitors without an account use it too (public forms).
-- Work that no person does (a scheduled job, the server itself) has no signed-in person and is never blocked, unless the table says 'anon'.
create or replace function public.block_if_feature_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.feature_blocked(tg_argv[0]) and (auth.uid() is not null or coalesce(tg_argv[1], '') = 'anon') then
    raise exception 'This is switched off for now. Please try again later.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare
  g record;
begin
  for g in select * from (values
    -- Go Live and live streams
    ('live_streams', 'live', ''), ('live_stream_comments', 'live', ''), ('live_stream_gifts', 'live', ''),
    -- Live Lounge / Meetings
    ('live_lounge_rooms', 'lounge', ''), ('live_lounge_room_chat', 'lounge', ''), ('live_lounge_meetings', 'lounge', ''),
    -- NOOB Rooms (voice rooms)
    ('noob_rooms', 'rooms', ''), ('noob_room_chat', 'rooms', ''), ('noob_room_participants', 'rooms', ''),
    -- the Games page: tables of two or more players, and the waiting line
    ('game_rooms', 'games', ''), ('matchmaking_queue', 'games', ''),
    -- NOOB Forms: making a form, and answering one (anyone with the link, no account)
    ('forms', 'forms', ''), ('form_responses', 'forms', 'anon'),
    -- the smaller pages
    ('song_guess_responses', 'song', ''), ('anon_messages', 'anonymous', ''), ('ask_questions', 'fun-ask', ''),
    ('polls', 'fun-polls', ''), ('poll_votes', 'fun-polls', ''), ('tot_votes', 'fun-this-or-that', ''), ('user_moods', 'fun-mood', ''),
    ('store_orders', 'shop', ''), ('app_suggestions', 'suggestions', '')
  ) as t(tbl, feature, who)
  loop
    if to_regclass('public.' || g.tbl) is not null then
      execute format('drop trigger if exists zz_feature_guard on public.%I', g.tbl);
      execute format('create trigger zz_feature_guard before insert on public.%I for each row execute function public.block_if_feature_off(%L, %L)', g.tbl, g.feature, g.who);
    end if;
  end loop;
end;
$$;
