-- Chats: last seen (with who may see it), and the new "Chats" settings.
--   1. Sixteen new account settings (chat.*), saved with the others by set_my_settings. Two of them are enforced here: who may see my last seen
--      (chat.lastSeen) and who may add me to a group (chat.groupAdds). The rest (text size, background, sounds, ...) are how the person's own chats look and behave.
--   2. chat_last_seen(user ids): when each of them was last seen, only if they allow it AND the asker allows it too (hide yours and you do not see theirs),
--      and only for people the asker shares a chat with or follows / is followed by.
--   3. chat_members_group_adds: someone who only lets contacts / nobody add them to groups is simply not added when a person they are not connected to tries.
-- Safe to run more than once.

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
    'likes.hideOthers', false, 'likes.hideMine', false,
    -- Chats
    'chat.lastSeen', 'everyone', 'chat.groupAdds', 'everyone', 'chat.typing', true,
    'chat.fontSize', 'medium', 'chat.wallpaper', 'doodle', 'chat.timeFormat', '12h',
    'chat.compactList', false, 'chat.previewInList', true, 'chat.listAvatars', true, 'chat.pinnedOnTop', true, 'chat.unreadBadges', true,
    'chat.sounds', true, 'chat.vibrate', true, 'chat.autoLoad', 'always', 'chat.confirmDelete', true, 'chat.encryptionNotice', true);
$$;

create or replace function public.settings_enums() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'msg.who', jsonb_build_array('connected', 'following', 'nobody'),
    'msg.storyReplies', jsonb_build_array('everyone', 'following', 'off'),
    'tags.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'mentions.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'comments.who', jsonb_build_array('everyone', 'followers', 'following', 'both', 'off'),
    'limit.audience', jsonb_build_array('non_followers', 'recent_followers'),
    'chat.lastSeen', jsonb_build_array('everyone', 'contacts', 'nobody'),
    'chat.groupAdds', jsonb_build_array('everyone', 'contacts', 'nobody'),
    'chat.fontSize', jsonb_build_array('small', 'medium', 'large'),
    'chat.wallpaper', jsonb_build_array('doodle', 'plain', 'dark'),
    'chat.timeFormat', jsonb_build_array('12h', '24h'),
    'chat.autoLoad', jsonb_build_array('always', 'wifi', 'never'));
$$;

-- "contacts" = people I follow or who follow me
create or replace function public.are_contacts(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.follows_user(p_a, p_b) or public.follows_user(p_b, p_a);
$$;
revoke execute on function public.are_contacts(uuid, uuid) from public, anon, authenticated;

create or replace function public.chat_last_seen(p_users uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb := '[]'::jsonb; u uuid; mode text; mine text; seen timestamptz; asks_ok boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_users is null then return res; end if;
  mine := public.setting_text(me, 'chat.lastSeen');
  for u in select distinct x from unnest(p_users[1:50]) as x loop
    continue when u is null or u = me;
    seen := null;
    -- only about people the asker shares a chat with, follows, or is followed by (no one can look up strangers)
    asks_ok := public.are_contacts(me, u)
      or exists (select 1 from public.chat_members a join public.chat_members b on b.chat_id = a.chat_id where a.user_id = me and b.user_id = u);
    mode := public.setting_text(u, 'chat.lastSeen');
    if asks_ok and mine <> 'nobody' and (mode = 'everyone' or (mode = 'contacts' and public.are_contacts(me, u))) then
      select pp.last_seen_at into seen from public.profile_private pp where pp.user_id = u;
    end if;
    res := res || jsonb_build_array(jsonb_build_object('userId', u, 'lastSeenAt', seen));
  end loop;
  return res;
end;
$$;
revoke execute on function public.chat_last_seen(uuid[]) from public, anon;
grant execute on function public.chat_last_seen(uuid[]) to authenticated;

-- Who may add me to a group chat. Self-joins, the Global Lounge, one-to-one chats, administrators and the server itself (no signed-in person) are never held back.
-- A person that is not allowed to add me is skipped quietly; whatever else was being done (creating the group, adding the others) carries on.
create or replace function public.chat_members_group_adds() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); grp boolean; glob boolean; mode text;
begin
  if me is null or new.user_id = me then return new; end if;
  select c.is_group, c.is_global_default into grp, glob from public.chats c where c.id = new.chat_id;
  if not coalesce(grp, false) or coalesce(glob, false) then return new; end if;
  if public.is_admin_id(me) then return new; end if;
  mode := coalesce(public.setting_text(new.user_id, 'chat.groupAdds'), 'everyone');
  if mode = 'everyone' then return new; end if;
  if mode = 'contacts' and public.are_contacts(me, new.user_id) then return new; end if;
  return null;
end;
$$;
revoke execute on function public.chat_members_group_adds() from public, anon, authenticated;
drop trigger if exists chat_members_group_adds on public.chat_members;
create trigger chat_members_group_adds before insert on public.chat_members for each row execute function public.chat_members_group_adds();
