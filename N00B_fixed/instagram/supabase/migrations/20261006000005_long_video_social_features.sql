-- Brings long-form videos up to the same social feature set posts and reels already have: comments
-- (sharing the one `comments` table, same as reels already do), save/bookmark, publisher settings
-- (hide like count, turn comments off), share-to-chat, and an edit path for title/description/
-- thumbnail. Likers/viewers lists are deliberately stricter than posts here: owner + admin only,
-- never public, per an explicit product decision for this content type.

-- -----------------------------------------------------------------------------------------------
-- 1. long_videos: new counters + publisher flags
-- -----------------------------------------------------------------------------------------------
alter table public.long_videos add column if not exists comments_count integer not null default 0;
alter table public.long_videos add column if not exists saves_count integer not null default 0;
alter table public.long_videos add column if not exists is_comments_disabled boolean not null default false;
alter table public.long_videos add column if not exists is_like_count_hidden boolean not null default false;

create or replace function public.guard_long_video_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at
       or new.likes_count is distinct from old.likes_count
       or new.views_count is distinct from old.views_count
       or new.comments_count is distinct from old.comments_count
       or new.saves_count is distinct from old.saves_count then
      raise exception 'You can''t change protected video fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. long_video_saves (bookmark) — same shape as post_saves/reel_saves
-- -----------------------------------------------------------------------------------------------
create table public.long_video_saves (
  video_id   uuid not null references public.long_videos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
create index long_video_saves_user_idx on public.long_video_saves (user_id);
alter table public.long_video_saves enable row level security;
create policy long_video_saves_owner on public.long_video_saves for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.long_videos v where v.id = video_id));
grant select, insert, delete on public.long_video_saves to authenticated;

create trigger long_video_saves_count after insert or delete on public.long_video_saves
  for each row execute function public.bump_counter('long_videos', 'saves_count', 'video_id');

-- -----------------------------------------------------------------------------------------------
-- 3. comments: a THIRD optional target, same pattern reels already use on this one shared table
-- -----------------------------------------------------------------------------------------------
alter table public.comments add column if not exists long_video_id uuid references public.long_videos (id) on delete cascade;
create index if not exists comments_long_video_idx on public.comments (long_video_id, created_at);

-- The original "(post_id is not null) <> (reel_id is not null)" check was declared inline with no
-- name, so Postgres auto-named it — found and dropped by its actual definition rather than a
-- guessed name, then replaced with a three-way "exactly one of post/reel/video" version.
do $$
declare conname text;
begin
  select con.conname into conname
  from pg_constraint con join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'comments' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%post_id%reel_id%';
  if conname is not null then
    execute format('alter table public.comments drop constraint %I', conname);
  end if;
end
$$;
alter table public.comments drop constraint if exists comments_target_check;
alter table public.comments add constraint comments_target_check check (
  (case when post_id is not null then 1 else 0 end)
  + (case when reel_id is not null then 1 else 0 end)
  + (case when long_video_id is not null then 1 else 0 end) = 1
);

create trigger comments_long_video_count after insert or delete on public.comments
  for each row execute function public.bump_counter('long_videos', 'comments_count', 'long_video_id');

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (
    (post_id is not null and exists (select 1 from public.posts p where p.id = post_id))
    or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id))
    or (long_video_id is not null and exists (select 1 from public.long_videos v where v.id = long_video_id))
  );
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (post_id is not null and exists (select 1 from public.posts p where p.id = post_id and not p.is_comments_disabled))
      or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id))
      or (long_video_id is not null and exists (select 1 from public.long_videos v where v.id = long_video_id and not v.is_comments_disabled))
    )
  );
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.can_moderate_content()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
    or exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid())
    or exists (select 1 from public.long_videos v where v.id = long_video_id and v.user_id = auth.uid())
  );

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id, c.long_video_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', coalesce(c.text, ''), 'likesCount', c.likes_count,
    'isLiked', exists (select 1 from public.comment_likes cl where cl.comment_id = c.id and cl.user_id = auth.uid()),
    'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username,
    'mediaUrl', c.media_url, 'mediaType', c.media_type, 'mediaDuration', c.media_duration)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;

create or replace function public.long_video_comments(p_video uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.long_video_id = p_video;
$$;

create or replace function public.add_long_video_comment(
  p_video uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this video.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this video.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and long_video_id = p_video;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (long_video_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_video, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented on your video: ' || notif_text, null, null, null);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, null, null);
  end if;
  perform public.award_points(me, 5, 'Commented on a video');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

create or replace function public.toggle_pin_comment(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.comments; owner uuid; v boolean;
begin
  select * into c from public.comments where id = p_comment;
  if not found then return jsonb_build_object('success', true, 'isPinned', false); end if;
  select coalesce(
    (select user_id from public.posts where id = c.post_id),
    (select user_id from public.reels where id = c.reel_id),
    (select user_id from public.long_videos where id = c.long_video_id)
  ) into owner;
  if me is null or (owner is distinct from me and not public.is_admin()) then
    raise exception 'Only the owner can pin comments.' using errcode = '42501';
  end if;
  update public.comments set is_pinned = not is_pinned where id = p_comment returning is_pinned into v;
  return jsonb_build_object('success', true, 'isPinned', v);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. Publisher settings, save toggle, edit, likers/viewers (owner + admin ONLY — stricter than
--    posts/reels, where the likers list is public)
-- -----------------------------------------------------------------------------------------------
create or replace function public.toggle_long_video_flag(p_video uuid, p_flag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; v boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if owner <> me and not public.is_admin() then raise exception 'You can only modify your own videos.' using errcode = '42501'; end if;
  if p_flag = 'comments' then
    update public.long_videos set is_comments_disabled = not is_comments_disabled where id = p_video returning is_comments_disabled into v;
    return jsonb_build_object('success', true, 'isCommentsDisabled', v);
  elsif p_flag = 'like_count' then
    update public.long_videos set is_like_count_hidden = not is_like_count_hidden where id = p_video returning is_like_count_hidden into v;
    return jsonb_build_object('success', true, 'isLikeCountHidden', v);
  end if;
  raise exception 'Unknown video setting.';
end;
$$;

create or replace function public.toggle_save_long_video(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); saved boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.long_videos where id = p_video) then raise exception 'Video not found'; end if;
  if exists (select 1 from public.long_video_saves where video_id = p_video and user_id = me) then
    delete from public.long_video_saves where video_id = p_video and user_id = me;
    saved := false;
  else
    insert into public.long_video_saves (video_id, user_id) values (p_video, me);
    saved := true;
  end if;
  return jsonb_build_object('success', true, 'isSaved', saved, 'savesCount', (select saves_count from public.long_videos where id = p_video));
end;
$$;

create or replace function public.saved_long_videos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(v) order by s.created_at desc), '[]'::jsonb)
  from public.long_video_saves s join public.long_videos v on v.id = s.video_id where s.user_id = auth.uid();
$$;

create or replace function public.update_long_video(
  p_video uuid, p_title text default null, p_description text default null, p_thumbnail_url text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if owner <> me then raise exception 'You can only edit your own videos.' using errcode = '42501'; end if;
  update public.long_videos set
    title = coalesce(left(btrim(p_title), 150), title),
    description = coalesce(left(btrim(p_description), 2000), description),
    thumbnail_url = coalesce(nullif(btrim(p_thumbnail_url), ''), thumbnail_url)
  where id = p_video;
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = p_video));
end;
$$;

create or replace function public.long_video_likers(p_video uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if owner <> auth.uid() and not public.is_admin() then raise exception 'Only the publisher can see who liked this.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by l.created_at desc)
    from public.long_video_likes l join public.profiles pr on pr.id = l.user_id where l.video_id = p_video), '[]'::jsonb));
end;
$$;

create or replace function public.long_video_viewers(p_video uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if owner <> auth.uid() and not public.is_admin() then raise exception 'Only the publisher can see who viewed this.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by v.created_at desc)
    from public.long_video_views v join public.profiles pr on pr.id = v.user_id where v.video_id = p_video), '[]'::jsonb));
end;
$$;

create or replace function public.get_long_video(p_video uuid) returns jsonb
language sql stable set search_path = public as $$
  select public.long_video_json(v) from public.long_videos v where v.id = p_video and public.can_view_author(v.user_id);
$$;

-- -----------------------------------------------------------------------------------------------
-- 5. long_video_json: the new counters/flags, and whether the CALLER saved it
-- -----------------------------------------------------------------------------------------------
create or replace function public.long_video_json(v public.long_videos) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'userId', v.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', v.video_url, 'thumbnailUrl', v.thumbnail_url, 'title', v.title, 'description', v.description,
    'durationSeconds', v.duration_seconds, 'likesCount', v.likes_count, 'viewsCount', v.views_count,
    'commentsCount', v.comments_count, 'savesCount', v.saves_count,
    'isCommentsDisabled', v.is_comments_disabled, 'isLikeCountHidden', v.is_like_count_hidden,
    'isLiked', exists (select 1 from public.long_video_likes l where l.video_id = v.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.long_video_saves s where s.video_id = v.id and s.user_id = auth.uid()),
    'createdAt', v.created_at)
  from public.profiles a where a.id = v.user_id;
$$;

-- -----------------------------------------------------------------------------------------------
-- 6. Share a video into chat — same send_message path as post/reel (20260925000045), extended with
--    a third branch. The client only ever sends which video; the server looks it up and builds the
--    stored snapshot itself, same privacy guarantee as the other two.
-- -----------------------------------------------------------------------------------------------
create or replace function public.send_message(p_chat uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); prof public.profiles; c public.chats; mid uuid;
  t text := coalesce(p->>'text', ''); media text := nullif(p->>'mediaUrl', '');
  reply jsonb := null; orig public.messages; other uuid;
  env jsonb := case when jsonb_typeof(p->'e2ee') = 'object' then p->'e2ee' else null end;
  shared_profile_id uuid := nullif(p->>'sharedProfileUserId', '')::uuid;
  shared_profile jsonb := null;
  target public.profiles;
  shared_post_id uuid := nullif(p->>'sharedPostId', '')::uuid;
  shared_post_type text := nullif(p->>'sharedPostType', '');
  shared_post jsonb := null;
  post_row public.posts; reel_row public.reels; video_row public.long_videos; first_slide record;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found or prof.is_suspended then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if c.is_group and c.only_admins_can_send and not public.is_group_admin(p_chat, me) then
    raise exception 'Only admins can send messages' using errcode = '42501';
  end if;
  if env is not null then
    if c.is_global_default or c.is_ai then raise exception 'This chat can not be end-to-end encrypted.'; end if;
    if not public.valid_e2ee_envelope(env, me) then raise exception 'That is not a valid encrypted message.'; end if;
    t := ''; media := null;
    if (p->'gameInvite') is not null or (p->'sharedTrack') is not null or shared_profile_id is not null or shared_post_id is not null then
      raise exception 'That is not a valid encrypted message.';
    end if;
  end if;

  if shared_profile_id is not null and env is null then
    select * into target from public.profiles where id = shared_profile_id;
    if not found then raise exception 'That account no longer exists.'; end if;
    shared_profile := jsonb_build_object(
      'userId', target.id, 'username', target.username, 'displayName', target.display_name,
      'avatar', target.avatar, 'isVerified', coalesce(target.is_verified, false));
  end if;

  if shared_post_id is not null and env is null then
    if shared_post_type = 'reel' then
      select * into reel_row from public.reels where id = shared_post_id;
      if not found then raise exception 'That reel no longer exists.'; end if;
      if not public.can_view_author(reel_row.user_id) then raise exception 'You cannot share this reel.' using errcode = '42501'; end if;
      select * into target from public.profiles where id = reel_row.user_id;
      shared_post := jsonb_build_object(
        'type', 'reel', 'id', reel_row.id, 'authorUsername', target.username, 'authorAvatar', target.avatar,
        'authorIsVerified', coalesce(target.is_verified, false), 'caption', reel_row.caption, 'thumbnailUrl', reel_row.thumbnail_url);
    elsif shared_post_type = 'post' then
      select * into post_row from public.posts where id = shared_post_id;
      if not found or post_row.is_archived then raise exception 'That post no longer exists.'; end if;
      if not public.can_view_author(post_row.user_id) then raise exception 'You cannot share this post.' using errcode = '42501'; end if;
      select * into target from public.profiles where id = post_row.user_id;
      select media_url, media_type into first_slide from public.post_slides where post_id = post_row.id order by position limit 1;
      shared_post := jsonb_build_object(
        'type', 'post', 'id', post_row.id, 'authorUsername', target.username, 'authorAvatar', target.avatar,
        'authorIsVerified', coalesce(target.is_verified, false), 'caption', post_row.caption,
        'thumbnailUrl', first_slide.media_url, 'thumbnailMediaType', first_slide.media_type);
    elsif shared_post_type = 'video' then
      select * into video_row from public.long_videos where id = shared_post_id;
      if not found then raise exception 'That video no longer exists.'; end if;
      if not public.can_view_author(video_row.user_id) then raise exception 'You cannot share this video.' using errcode = '42501'; end if;
      select * into target from public.profiles where id = video_row.user_id;
      shared_post := jsonb_build_object(
        'type', 'video', 'id', video_row.id, 'authorUsername', target.username, 'authorAvatar', target.avatar,
        'authorIsVerified', coalesce(target.is_verified, false), 'caption', video_row.title, 'thumbnailUrl', video_row.thumbnail_url);
    else
      raise exception 'Invalid share type.';
    end if;
  end if;

  if btrim(t) = '' and media is null and (p->'gameInvite') is null and (p->'sharedTrack') is null and shared_profile is null and shared_post is null and env is null then
    raise exception 'Message cannot be empty.';
  end if;

  if not c.is_group then
    select m.user_id into other from public.chat_members m where m.chat_id = p_chat and m.user_id <> me limit 1;
    if other is not null and exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = me)) then
      raise exception 'You can''t message this person.' using errcode = '42501';
    end if;
  end if;

  if (p->'replyTo'->>'messageId') ~* '^[0-9a-f-]{36}$' then
    select * into orig from public.messages where id = (p->'replyTo'->>'messageId')::uuid and chat_id = p_chat;
    if found then
      reply := jsonb_build_object('messageId', orig.id,
        'senderUsername', (select username from public.profiles where id = orig.sender_id),
        'textPreview', case when orig.e2ee is not null then ''
                            when nullif(orig.text, '') is not null then left(orig.text, 120)
                            when orig.media_type = 'sticker' then 'Sticker' when orig.media_url is not null then 'Attachment' else '' end);
    end if;
  end if;

  insert into public.messages (chat_id, sender_id, text, media_url, media_type, shared_track, game_invite, shared_profile, shared_post, reply_to, audio_duration, scheduled_at, e2ee)
  values (p_chat, me, t, media,
          coalesce(nullif(p->>'mediaType', ''), case when media is not null then 'image' when (p->'gameInvite') is not null then 'game_invite' else 'text' end),
          case when env is null then p->'sharedTrack' end, case when env is null then p->'gameInvite' end, shared_profile, shared_post, reply,
          case when env is null then nullif(p->>'audioDuration', '') end, nullif(p->>'scheduledAt', '')::timestamptz, env)
  returning id into mid;

  if not c.is_group and other is not null and (t <> '' or env is not null or shared_profile is not null or shared_post is not null) then
    perform public.notify_user(other, 'new_message', me,
      case when env is not null then '@' || prof.username || ': 🔒 New message'
           when t = '' and shared_profile is not null then '@' || prof.username || ' shared @' || (shared_profile->>'username') || '''s profile with you'
           when t = '' and shared_post is not null then '@' || prof.username || ' shared a ' || (shared_post->>'type') || ' with you'
           else '@' || prof.username || ': ' || left(t, 80) || case when length(t) > 80 then '…' else '' end end,
      '💬 New Message', null, null, p_chat);
  end if;
  return jsonb_build_object('success', true, 'message', (select public.message_json(m) from public.messages m where m.id = mid));
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 7. Grants
-- -----------------------------------------------------------------------------------------------
grant execute on function public.long_video_json(public.long_videos) to authenticated;
grant execute on function public.long_video_comments(uuid) to authenticated;
grant execute on function public.add_long_video_comment(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.toggle_long_video_flag(uuid, text) to authenticated;
grant execute on function public.toggle_save_long_video(uuid) to authenticated;
grant execute on function public.saved_long_videos() to authenticated;
grant execute on function public.update_long_video(uuid, text, text, text) to authenticated;
grant execute on function public.long_video_likers(uuid) to authenticated;
grant execute on function public.long_video_viewers(uuid) to authenticated;
grant execute on function public.get_long_video(uuid) to authenticated;
