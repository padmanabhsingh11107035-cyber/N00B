-- NOOB — two independent additions:
--
-- 1) Comment replies (posts AND reels, which already share the one `comments` table): you can reply
--    to anyone's comment, including your own, like Instagram. Threads are flattened to one level —
--    replying to a reply attaches to that reply's own parent (the original top-level comment) instead
--    of nesting further, exactly like Instagram, so the UI only ever needs "a comment, and its flat
--    list of replies underneath."
alter table public.comments add column if not exists parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column if not exists reply_to_user_id uuid references public.profiles (id) on delete set null;
create index if not exists comments_parent_idx on public.comments (parent_id, created_at);

-- postId still coalesces to reel_id for a reel comment (reels share this same comment shape, and
-- carrying the reel's id under postId too is a deliberate compatibility behavior from the 19 Sep
-- migration — preserved here unchanged, alongside the new reply fields).
create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', c.text, 'likesCount', c.likes_count,
    'isLiked', false, 'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;

-- Adding a new parameter with `create or replace` creates an ambiguous SECOND overload instead of
-- replacing the original two-argument function (Postgres only replaces an exact signature match) —
-- drop the old one first so calls with just (post, text) are never ambiguous again.
drop function if exists public.add_comment(uuid, text);
create or replace function public.add_comment(p_post uuid, p_text text, p_parent_comment uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment text cannot be empty'; end if;
  select user_id, is_comments_disabled into owner, disabled from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this post.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and post_id = p_post;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (post_id, user_id, text, parent_id, reply_to_user_id)
    values (p_post, me, t, top_parent, reply_to) returning id into cid;

  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me,
      'commented: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, p_post);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me,
      'replied to your comment: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, p_post);
  end if;
  perform public.award_points(me, 5, 'Posted a comment');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

drop function if exists public.add_reel_comment(uuid, text);
create or replace function public.add_reel_comment(p_reel uuid, p_text text, p_parent_comment uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment text cannot be empty'; end if;
  select user_id, is_comments_disabled into owner, disabled from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this reel.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and reel_id = p_reel;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (reel_id, user_id, text, parent_id, reply_to_user_id)
    values (p_reel, me, t, top_parent, reply_to) returning id into cid;

  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me,
      'commented on your reel: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, null, p_reel);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me,
      'replied to your comment: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, null, p_reel);
  end if;
  perform public.award_points(me, 5, 'Commented on a reel');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

-- 2) Chat message reactions — the `reactions` jsonb column on `messages` (and reading it back in
--    message_json) has existed since the very first chat migration, but nothing ever WROTE to it: any
--    reaction a person added only ever lived in that browser tab's local state and vanished on
--    reload or never reached anyone else — which is exactly "the likes are not saved". One reaction
--    per person per message (WhatsApp/iMessage style): reacting with a new emoji replaces your old
--    one, tapping the same emoji again removes it.
create or replace function public.toggle_message_reaction(p_message uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); msg public.messages; emoji text := btrim(coalesce(p_emoji, ''));
  entry jsonb; users jsonb; had_same boolean := false; out_reactions jsonb := '[]'::jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if emoji = '' then raise exception 'Pick an emoji to react with.'; end if;
  select * into msg from public.messages where id = p_message;
  if not found then raise exception 'Message not found.'; end if;
  if not public.is_chat_member(msg.chat_id) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;

  for entry in select * from jsonb_array_elements(coalesce(msg.reactions, '[]'::jsonb)) loop
    users := coalesce(entry -> 'users', '[]'::jsonb);
    if users @> to_jsonb(me::text) then
      if entry ->> 'emoji' = emoji then had_same := true; end if;
      select coalesce(jsonb_agg(u), '[]'::jsonb) into users from jsonb_array_elements_text(users) u where u <> me::text;
    end if;
    if jsonb_array_length(users) > 0 then
      out_reactions := out_reactions || jsonb_build_array(jsonb_build_object('emoji', entry ->> 'emoji', 'count', jsonb_array_length(users), 'users', users));
    end if;
  end loop;

  if not had_same then
    if exists (select 1 from jsonb_array_elements(out_reactions) e where e ->> 'emoji' = emoji) then
      select jsonb_agg(case when e ->> 'emoji' = emoji
        then jsonb_build_object('emoji', emoji, 'count', jsonb_array_length(e -> 'users') + 1, 'users', (e -> 'users') || to_jsonb(me::text))
        else e end)
      into out_reactions from jsonb_array_elements(out_reactions) e;
    else
      out_reactions := out_reactions || jsonb_build_array(jsonb_build_object('emoji', emoji, 'count', 1, 'users', jsonb_build_array(me::text)));
    end if;
  end if;

  update public.messages set reactions = out_reactions where id = p_message;
  return jsonb_build_object('success', true, 'reactions', out_reactions);
end;
$$;

grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
