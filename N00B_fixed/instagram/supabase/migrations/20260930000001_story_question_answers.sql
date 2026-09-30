-- NOOB — the Questions sticker: a viewer types a free-text answer to the story owner's prompt.
-- Answers are private to the story's owner (never shown to other viewers), same visibility model
-- as poll voters. Mirrors the story_poll_votes migration's shape/conventions.

create table if not exists public.story_question_answers (
  id            uuid primary key default gen_random_uuid(),
  story_id      uuid not null references public.stories (id) on delete cascade,
  sticker_index int  not null check (sticker_index between 0 and 49),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  answer        text not null check (char_length(answer) between 1 and 500),
  created_at    timestamptz not null default now()
);
alter table public.story_question_answers enable row level security;
-- No direct table access at all: answers are only read and written through the two functions below.
revoke all on public.story_question_answers from anon, authenticated;

-- Whether the sticker at this position is really a Questions sticker (0 stickers array / wrong
-- type / out-of-range index all fail closed).
create or replace function public.is_story_question_sticker(st jsonb, p_sticker int) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(st) = 'array' and p_sticker between 0 and jsonb_array_length(st) - 1
         and st -> p_sticker ->> 'type' = 'question';
$$;

create or replace function public.answer_story_question(p_story uuid, p_sticker int, p_answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; clean text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  if not public.is_story_question_sticker(st, p_sticker) then raise exception 'This question was not found.'; end if;
  clean := trim(p_answer);
  if clean = '' then raise exception 'Write an answer first.'; end if;
  if char_length(clean) > 500 then raise exception 'Keep your answer under 500 characters.'; end if;
  insert into public.story_question_answers (story_id, sticker_index, user_id, answer)
  values (p_story, p_sticker, me, clean);
  return jsonb_build_object('success', true);
end;
$$;

-- Every Questions sticker's submitted answers on one story, keyed by the sticker's position.
-- Owner-only — raises if anyone else calls it, same as story_poll_results shows voters only to
-- the owner (but here the whole answer, not just aggregated counts, is private).
create or replace function public.story_question_results(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; res jsonb := '{}'::jsonb; i int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null or jsonb_typeof(st) <> 'array' then return res; end if;
  if owner <> me then raise exception 'Only the story owner can see the answers.' using errcode = '42501'; end if;
  for i in 0 .. least(jsonb_array_length(st), 50) - 1 loop
    if public.is_story_question_sticker(st, i) then
      res := res || jsonb_build_object(i::text, coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'username', p.username, 'avatar', p.avatar, 'answer', a.answer, 'createdAt', a.created_at
        ) order by a.created_at desc)
        from public.story_question_answers a
        join public.profiles p on p.id = a.user_id
        where a.story_id = p_story and a.sticker_index = i
      ), '[]'::jsonb));
    end if;
  end loop;
  return res;
end;
$$;

revoke execute on function public.answer_story_question(uuid, int, text), public.story_question_results(uuid) from public, anon;
grant execute on function public.answer_story_question(uuid, int, text), public.story_question_results(uuid) to authenticated;
