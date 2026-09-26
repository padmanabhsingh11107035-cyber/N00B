-- NOOB — story polls now keep real votes. The poll sticker used to save nothing and showed made-up
-- numbers (68% for whatever you tapped, 32% for the rest). Each person has one vote per poll (tapping
-- another option changes it); everyone who can see the story sees the real percentages after voting,
-- and the story's owner also sees who voted for what.

create table if not exists public.story_poll_votes (
  story_id      uuid not null references public.stories (id) on delete cascade,
  sticker_index int  not null check (sticker_index between 0 and 49),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  option_index  int  not null check (option_index between 0 and 9),
  created_at    timestamptz not null default now(),
  primary key (story_id, sticker_index, user_id)
);
alter table public.story_poll_votes enable row level security;
-- No direct table access at all: votes are only read and written through the two functions below.
revoke all on public.story_poll_votes from anon, authenticated;

-- The poll sticker's number of options (0 when the sticker isn't a poll).
create or replace function public.story_poll_option_count(st jsonb, p_sticker int) returns int
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(st) = 'array' and p_sticker between 0 and jsonb_array_length(st) - 1
                   and st -> p_sticker ->> 'type' = 'poll'
                   and jsonb_typeof(st -> p_sticker -> 'data' -> 'options') = 'array'
              then least(jsonb_array_length(st -> p_sticker -> 'data' -> 'options'), 10) else 0 end;
$$;

-- One poll's results. Only ever called from inside the two functions below (which check who may see
-- the story first); callers can't reach the table on their own.
create or replace function public.story_poll_json(p_story uuid, p_sticker int, p_options int, p_owner boolean) returns jsonb
language sql stable set search_path = public as $$
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
      join public.profiles p on p.id = v.user_id), '[]'::jsonb) else '[]'::jsonb end
  );
$$;
revoke execute on function public.story_poll_json(uuid, int, int, boolean) from public, anon, authenticated;

create or replace function public.vote_story_poll(p_story uuid, p_sticker int, p_option int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; n_opts int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  n_opts := public.story_poll_option_count(st, p_sticker);
  if n_opts = 0 then raise exception 'This poll was not found.'; end if;
  if p_option is null or p_option < 0 or p_option >= n_opts then raise exception 'Choose one of the poll options.'; end if;
  insert into public.story_poll_votes (story_id, sticker_index, user_id, option_index)
  values (p_story, p_sticker, me, p_option)
  on conflict (story_id, sticker_index, user_id) do update set option_index = excluded.option_index, created_at = now();
  return jsonb_build_object('success', true, 'poll', public.story_poll_json(p_story, p_sticker, n_opts, owner = me));
end;
$$;

-- Every poll on one story, keyed by the sticker's position: {"0": {counts, total, myVote, voters}}.
create or replace function public.story_poll_results(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; st jsonb; res jsonb := '{}'::jsonb; i int; n_opts int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id, stickers into owner, st from public.stories where id = p_story;
  if owner is null or jsonb_typeof(st) <> 'array' then return res; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  for i in 0 .. least(jsonb_array_length(st), 50) - 1 loop
    n_opts := public.story_poll_option_count(st, i);
    if n_opts > 0 then
      res := res || jsonb_build_object(i::text, public.story_poll_json(p_story, i, n_opts, owner = me));
    end if;
  end loop;
  return res;
end;
$$;

revoke execute on function public.vote_story_poll(uuid, int, int), public.story_poll_results(uuid) from public, anon;
grant execute on function public.vote_story_poll(uuid, int, int), public.story_poll_results(uuid) to authenticated;
