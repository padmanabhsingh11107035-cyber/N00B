-- NOOB - the Question sticker on a story can now be ANONYMOUS ("Send me anonymous messages"), and answers follow the same rules as every other way of replying to a story.
--
--   * A question sticker made with data.anonymous = true: the answers the owner reads carry no name and no picture (the server leaves them out, not the app), so the owner can not
--     tell who wrote what. Everything else about the sticker is unchanged. Stickers made before this (no "anonymous") keep showing @username as they always did.
--   * Answers obey the owner's "Who can reply to your story" choice (Settings and activity: Everyone / People you follow / Off) and "Limit interactions", like a story reply does.
--   * No flooding: at most 5 answers from one person to one question on one story, and an answer can not repeat the one just before it.
--
-- Honest limit: anonymous hides the writer from the owner and from everyone else; the service itself still knows (it needs to, to stop abuse).
-- Safe to run again.

create or replace function public.answer_story_question(p_story uuid, p_sticker int, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; clean text; who text; n int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  if not public.is_story_question_sticker(st, p_sticker) then raise exception 'This question was not found.'; end if;
  clean := trim(coalesce(p_answer, ''));
  if clean = '' then raise exception 'Write an answer first.'; end if;
  if char_length(clean) > 500 then raise exception 'Keep your answer under 500 characters.'; end if;

  if owner <> me and not public.is_admin_id(me) then
    who := public.setting_text(owner, 'msg.storyReplies');
    if who = 'off' then raise exception 'This account has turned off replies to its stories.' using errcode = '42501'; end if;
    if who = 'following' and not public.follows_user(owner, me) then raise exception 'Only people this account follows can answer.' using errcode = '42501'; end if;
    if public.limit_applies(owner, me) then raise exception 'This account has limited who can answer right now.' using errcode = '42501'; end if;
  end if;

  select count(*) into n from public.story_question_answers where story_id = p_story and sticker_index = p_sticker and user_id = me;
  if n >= 5 then raise exception 'You have already sent 5 answers to this question.' using errcode = '42501'; end if;
  if exists (select 1 from public.story_question_answers where story_id = p_story and sticker_index = p_sticker and user_id = me and answer = clean) then
    raise exception 'You already sent that.' using errcode = '23505';
  end if;

  insert into public.story_question_answers (story_id, sticker_index, user_id, answer)
  values (p_story, p_sticker, me, clean);
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.story_question_results(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; res jsonb := '{}'::jsonb; i int; anon boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null or jsonb_typeof(st) <> 'array' then return res; end if;
  if owner <> me then raise exception 'Only the story owner can see the answers.' using errcode = '42501'; end if;
  for i in 0 .. least(jsonb_array_length(st), 50) - 1 loop
    if public.is_story_question_sticker(st, i) then
      anon := coalesce((st -> i -> 'data' ->> 'anonymous') = 'true', false);
      res := res || jsonb_build_object(i::text, jsonb_build_object(
        'anonymous', anon,
        'answers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'username', case when anon then 'Anonymous' else p.username end,
            'avatar', case when anon then '' else p.avatar end,
            'answer', a.answer,
            'createdAt', a.created_at
          ) order by a.created_at desc)
          from (select * from public.story_question_answers x where x.story_id = p_story and x.sticker_index = i order by x.created_at desc limit 200) a
          join public.profiles p on p.id = a.user_id
        ), '[]'::jsonb)));
    end if;
  end loop;
  return res;
end;
$$;

revoke execute on function public.answer_story_question(uuid, int, text), public.story_question_results(uuid) from public, anon;
grant execute on function public.answer_story_question(uuid, int, text), public.story_question_results(uuid) to authenticated;

-- A stranger could ask for a story by its address through this one (it was never closed to visitors): visitors have no business here.
revoke execute on function public.story_by_id(uuid) from public, anon;
grant execute on function public.story_by_id(uuid) to authenticated;
