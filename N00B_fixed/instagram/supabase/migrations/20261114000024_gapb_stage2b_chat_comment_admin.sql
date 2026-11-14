-- 20261114000024: Privacy gap B, stage 2b-3: message_json, chat_json, comment_json, team_application_json, sparkx_application_json, story_poll_json read the card through profile_brief / profile_noob_admin_ids
-- Part of docs/PRIVACY-GAP-B-PLAN.md (owner decisions D1 to D3 taken: nothing visible changes).
-- LIVE EFFECT: none visible: identical answers
-- Safe to run twice (create or replace / on conflict do nothing). No table row is changed, nothing is deleted.
-- ROLLBACK: supabase/one-off/rollback-gapb-stage2b3.sql

create or replace function public.message_json(m messages)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
  from (select 1) v left join lateral public.profile_brief(m.sender_id) a on true;
$function$;

create or replace function public.chat_json(c chats)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'avatar', c.avatar, 'description', c.description,
    'participants', coalesce(public.chat_participants_json(c.id), '[]'::jsonb),
    'isGroup', c.is_group, 'creatorId', c.creator_id,
    'adminIds', (
      select coalesce(jsonb_agg(distinct t.x), '[]'::jsonb) from (
        select m2.user_id as x from public.chat_members m2 where m2.chat_id = c.id and m2.is_admin
        union select c.creator_id where c.creator_id is not null
        union select g.id from public.profile_noob_admin_ids() g where c.is_group
      ) t),
    'onlyAdminsCanSend', c.only_admins_can_send,
    'isGlobalDefault', c.is_global_default, 'isAi', c.is_ai, 'isEnded', c.is_ended, 'endedAt', c.ended_at, 'review', c.review,
    'isEncryptable', not c.is_global_default and not c.is_ai and public.chat_is_encryptable(c.id),
    'unreadCount', (
      select count(*) from (
        select 1 from public.messages um
        where um.chat_id = c.id and um.sender_id is distinct from auth.uid()
          and um.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
          and um.created_at >= h.hs
          and not exists (select 1 from public.message_hides hh where hh.user_id = auth.uid() and hh.message_id = um.id)
        limit 100) capped),
    'isPinned', c.is_global_default or coalesce(me.is_pinned, false), 'isMuted', coalesce(me.is_muted, false),
    'themeColor', c.theme_color, 'vanishMode', c.vanish_mode, 'customNickname', me.nickname,
    'readReceiptsEnabled', c.read_receipts_enabled, 'createdAt', c.created_at,
    'lastMessage', (select public.message_json(lm) from public.messages lm
                    where lm.chat_id = c.id
                      and lm.created_at >= h.hs
                      and not exists (select 1 from public.message_hides hh where hh.user_id = auth.uid() and hh.message_id = lm.id)
                    order by lm.created_at desc limit 1))
  from (select 1) v
  left join public.chat_members me on me.chat_id = c.id and me.user_id = auth.uid()
  cross join lateral (select coalesce(public.history_start(c.id, auth.uid()), '-infinity'::timestamptz) as hs) h;
$function$;

create or replace function public.comment_json(c comments)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id, c.long_video_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'text', coalesce(c.text, ''), 'likesCount', c.likes_count,
    'isLiked', exists (select 1 from public.comment_likes cl where cl.comment_id = c.id and cl.user_id = auth.uid()),
    'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username,
    'mediaUrl', c.media_url, 'mediaType', c.media_type, 'mediaDuration', c.media_duration)
  from public.profile_brief(c.user_id) a
  left join lateral public.profile_brief(c.reply_to_user_id) ru on true;
$function$;

create or replace function public.team_application_json(t team_applications)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'fullName', t.full_name, 'roleInterested', t.role_interested, 'whyJoin', t.why_join, 'experience', t.experience,
    'availability', t.availability, 'contact', t.contact, 'status', t.status, 'createdAt', t.created_at,
    'reviewedBy', (select b.username from public.profile_brief(t.reviewed_by) b), 'reviewedAt', t.reviewed_at)
  from public.profile_brief(t.user_id) p;
$function$;

create or replace function public.sparkx_application_json(t sparkx_applications)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'fullName', t.full_name, 'grade', t.grade, 'schoolName', t.school_name, 'contribution', t.contribution,
    'aiKnowledge', t.ai_knowledge, 'experience', t.experience, 'availability', t.availability, 'contact', t.contact,
    'status', t.status, 'createdAt', t.created_at, 'meetingInvitedAt', t.meeting_invited_at,
    'reviewedBy', (select b.username from public.profile_brief(t.reviewed_by) b), 'reviewedAt', t.reviewed_at)
  from public.profile_brief(t.user_id) p;
$function$;

create or replace function public.story_poll_json(p_story uuid, p_sticker integer, p_options integer, p_owner boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_agg(coalesce(c.n, 0) order by o.i)
      from generate_series(0, p_options - 1) as o(i)
      left join (select option_index, count(*) as n from public.story_poll_votes
                 where story_id = p_story and sticker_index = p_sticker group by option_index) c on c.option_index = o.i), '[]'::jsonb),
    'total', (select count(*) from public.story_poll_votes where story_id = p_story and sticker_index = p_sticker and option_index < p_options),
    'myVote', (select option_index from public.story_poll_votes where story_id = p_story and sticker_index = p_sticker and user_id = auth.uid()),
    'voters', case when p_owner then coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'option', v.option_index) order by v.created_at desc)
      from (select * from public.story_poll_votes where story_id = p_story and sticker_index = p_sticker
            order by created_at desc limit 200) v
      join lateral public.profile_brief(v.user_id) p on true), '[]'::jsonb) else '[]'::jsonb end
  );
$function$;
