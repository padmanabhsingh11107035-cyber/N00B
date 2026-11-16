-- 1. One anonymous thought by its id (for its own page, /thought/<id>): the same four fields as the feed - never an author.
-- 2. Notifications for the owner of a poll or of an anonymous thought when someone comments (always) or likes it (at 1, 5, 10, 25, 50, 100, 250, 500, 1000 likes,
--    so a popular post does not flood the phone). A comment's notification shows who commented (the card shows that to everyone anyway). A like shows nobody.
--    The owner of an anonymous thought is found inside the database and is never sent anywhere except as the person who receives the notification.
-- 3. my_notifications() (the Notifications page) also says which poll / thought a notification is about, so a tap opens it. Everything else in it is as before.
-- Safe to run more than once.

create or replace function public.anon_message_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.anon_messages;
begin
  select * into m from public.anon_messages where id = p_id and removed_at is null and not hidden;
  if not found then return null; end if;
  return jsonb_build_object('id', m.id, 'body', m.body, 'createdAt', m.created_at, 'mediaKey', m.media_key,
    'mediaKeys', to_jsonb(coalesce(m.media_keys, case when m.media_key is not null then array[m.media_key] end)));
end;
$$;
grant execute on function public.anon_message_get(uuid) to anon, authenticated;

-- who owns it (private helper, never callable from the app)
create or replace function public.mix_owner(p_kind text, p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when p_kind = 'anon' then (select author_id from public.anon_messages where id = p_id)
              when p_kind = 'poll' then (select creator_id from public.polls where id = p_id) end;
$$;
revoke execute on function public.mix_owner(text, uuid) from public, anon, authenticated;

create or replace function public.mix_like(p_kind text, p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
  rc int := 0;
  total int;
  owner uuid;
begin
  if me is null then raise exception 'Please log in to like this.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not like right now.'; end if;
  if not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if coalesce(p_on, true) then
    select count(*) into n from public.mix_likes where user_id = me and created_at > now() - interval '1 hour';
    if n >= 200 then raise exception 'You are liking very fast. Please slow down a little.'; end if;
    insert into public.mix_likes (kind, target_id, user_id) values (p_kind, p_id, me) on conflict do nothing;
    get diagnostics rc = row_count;
  else
    delete from public.mix_likes where kind = p_kind and target_id = p_id and user_id = me;
  end if;
  select count(*) into total from public.mix_likes l where l.kind = p_kind and l.target_id = p_id;
  if rc = 1 and total in (1, 5, 10, 25, 50, 100, 250, 500, 1000) then
    owner := public.mix_owner(p_kind, p_id);
    if owner is not null and owner <> me and not exists (
      select 1 from public.notifications x where x.target_user_id = owner and x.type = 'post_like' and x.data->>'mixId' = p_id::text and x.data->>'likes' = total::text) then
      insert into public.notifications (target_user_id, actor_id, type, message, data)
      values (owner, null, 'post_like',
              case when total = 1 then 'Someone liked your ' else total || ' people liked your ' end || case when p_kind = 'poll' then 'poll' else 'anonymous thought' end,
              jsonb_build_object('mixKind', p_kind, 'mixId', p_id, 'likes', total));
    end if;
  end if;
  return jsonb_build_object('liked', coalesce(p_on, true), 'likes', total);
end;
$$;
revoke execute on function public.mix_like(text, uuid, boolean) from public, anon;
grant execute on function public.mix_like(text, uuid, boolean) to authenticated;

create or replace function public.mix_comment_add(p_kind text, p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := public.fun_clean_text(p_body);
  n int;
  c public.mix_comments;
  owner uuid;
begin
  if me is null then raise exception 'Please log in to comment.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not comment right now.'; end if;
  if not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if clean = '' then raise exception 'Write a comment first.'; end if;
  if char_length(clean) > 500 then raise exception 'A comment can be at most 500 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mix_comment:' || me::text, 0));
  if exists (select 1 from public.mix_comments where user_id = me and created_at > now() - interval '5 seconds') then raise exception 'Please wait a moment before commenting again.'; end if;
  select count(*) into n from public.mix_comments where user_id = me and created_at > now() - interval '1 hour';
  if n >= 40 then raise exception 'You have commented a lot just now. Please try again a little later.'; end if;
  insert into public.mix_comments (kind, target_id, user_id, body) values (p_kind, p_id, me, clean) returning * into c;
  owner := public.mix_owner(p_kind, p_id);
  if owner is not null and owner <> me then
    insert into public.notifications (target_user_id, actor_id, type, message, data)
    values (owner, me, 'post_comment', 'commented on your ' || case when p_kind = 'poll' then 'poll' else 'anonymous thought' end || ': ' || left(clean, 100),
            jsonb_build_object('mixKind', p_kind, 'mixId', p_id));
  end if;
  return public.mix_comment_json(c);
end;
$$;
revoke execute on function public.mix_comment_add(text, uuid, text) from public, anon;
grant execute on function public.mix_comment_add(text, uuid, text) to authenticated;

-- The Notifications page: the same list as before (chat alerts left out, history from the day the person joined), with the poll / thought a notification is about.
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('notifications', coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'type', x.type, 'title', x.title, 'message', x.message, 'createdAt', x.created_at,
    'targetUserId', coalesce(x.target_user_id::text, 'all'),
    'actorId', x.actor_id, 'actorUsername', x.username, 'actorDisplayName', x.display_name, 'actorAvatar', x.avatar,
    'senderId', x.actor_id, 'senderUsername', x.username, 'senderDisplayName', x.display_name, 'senderAvatar', x.avatar,
    'senderIsVerified', coalesce(x.is_verified, false),
    'postId', x.post_id, 'reelId', x.reel_id, 'chatId', x.chat_id, 'actionStatus', x.action_status,
    'scratchCardId', x.scratch_card_id,
    'mixKind', x.data->>'mixKind', 'mixId', x.data->>'mixId',
    'isRead', exists (select 1 from public.notification_reads r where r.notification_id = x.id and r.user_id = auth.uid())
  ) order by x.created_at desc), '[]'::jsonb))
  from (
    select n.*, a.username, a.display_name, a.avatar, a.is_verified, n.data->>'scratchCardId' as scratch_card_id
    from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    where auth.uid() is not null
      and (n.target_user_id = auth.uid() or n.target_user_id is null)
      and n.type <> 'new_message'
      and n.created_at >= (select coalesce(public.account_history_start(auth.uid()), '-infinity'::timestamptz))
      and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid())
    order by n.created_at desc
    limit 150
  ) x;
$$;
