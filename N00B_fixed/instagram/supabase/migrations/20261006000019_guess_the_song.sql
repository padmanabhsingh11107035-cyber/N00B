-- Guess the Song — standalone feature (NOT nested inside NOOB Rooms, no voice/chat at all): a single,
-- global, always-running round. A clip plays, 4 title options are shown, first answer locks in,
-- correct = +1 point. Lazy-advance-on-read, same no-cron pattern as Daily NOOB and the rest of this
-- session's realtime-ish features: whichever client happens to call get_song_guess_round() after the
-- round's timer has expired is the one that rolls the next song, and everyone else just gets it
-- pushed via the realtime UPDATE on the one singleton row.
--
-- The correct answer is a genuine secret: song_guess_tracks has NO select policy at all (RLS enabled,
-- zero policies = nobody can read it directly, including the uploader), so song titles can only ever
-- reach a client through the controlled jsonb this migration's functions choose to return — the
-- 'guessing' phase strips the title out entirely, same as Daily NOOB never shows settlement data for
-- a day still in progress.

drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in
      ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos', 'daily', 'songs')
  );

create table if not exists public.song_guess_tracks (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  artist               text not null default '',
  audio_url            text not null,
  clip_start_seconds   integer not null default 0,
  clip_length_seconds  integer not null default 5,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);
alter table public.song_guess_tracks enable row level security;
-- Deliberately no select policy — see the file header. Admin management and round-picking both go
-- through security definer functions below, which bypass RLS as the function owner.

create table if not exists public.song_guess_round (
  id             integer primary key default 1 check (id = 1),
  track_id       uuid references public.song_guess_tracks(id) on delete set null,
  options        jsonb not null default '[]'::jsonb,
  correct_index  integer,
  phase_ends_at  timestamptz not null default now(),
  round_number   bigint not null default 0
);
insert into public.song_guess_round (id) values (1) on conflict (id) do nothing;
alter table public.song_guess_round enable row level security;
-- No select policy here either — the round's own correct_index would otherwise leak directly.

create table if not exists public.song_guess_responses (
  round_number  bigint not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  chosen_index  integer not null,
  is_correct    boolean not null,
  created_at    timestamptz not null default now(),
  primary key (round_number, user_id)
);
alter table public.song_guess_responses enable row level security;
drop policy if exists song_guess_responses_own on public.song_guess_responses;
create policy song_guess_responses_own on public.song_guess_responses for select using (user_id = auth.uid());

create table if not exists public.song_guess_scores (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  points      integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.song_guess_scores enable row level security;
drop policy if exists song_guess_scores_read on public.song_guess_scores;
create policy song_guess_scores_read on public.song_guess_scores for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_guess_round'
    )
  then
    alter publication supabase_realtime add table public.song_guess_round;
  end if;
end
$$;

create or replace function public.get_song_guess_round() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); cur public.song_guess_round; picked public.song_guess_tracks; track public.song_guess_tracks;
  distractor_titles text[]; opts text[]; correct_pos integer; my_answer public.song_guess_responses;
begin
  select * into cur from public.song_guess_round where id = 1 for update;

  if cur.phase_ends_at <= now() and (select count(*) from public.song_guess_tracks) >= 4 then
    select * into picked from public.song_guess_tracks order by random() limit 1;
    select coalesce(array_agg(title), '{}') into distractor_titles
      from (select title from public.song_guess_tracks where id <> picked.id order by random() limit 3) d;
    opts := distractor_titles || picked.title;
    select array_agg(x order by rnd) into opts from (select x, random() as rnd from unnest(opts) x) s;
    select ord into correct_pos from unnest(opts) with ordinality as u(x, ord) where x = picked.title limit 1;
    update public.song_guess_round
      set track_id = picked.id, options = to_jsonb(opts), correct_index = correct_pos - 1,
          phase_ends_at = now() + interval '20 seconds', round_number = round_number + 1
      where id = 1
      returning * into cur;
  end if;

  if cur.track_id is not null then
    select * into track from public.song_guess_tracks where id = cur.track_id;
  end if;

  if me is not null then
    select * into my_answer from public.song_guess_responses where round_number = cur.round_number and user_id = me;
  end if;

  return jsonb_build_object(
    'roundNumber', cur.round_number,
    'options', coalesce(cur.options, '[]'::jsonb),
    'phaseEndsAt', cur.phase_ends_at,
    'myAnswer', case when my_answer.user_id is null then null else jsonb_build_object('chosenIndex', my_answer.chosen_index, 'isCorrect', my_answer.is_correct) end,
    'clipUrl', track.audio_url,
    'clipStartSeconds', coalesce(track.clip_start_seconds, 0),
    'clipLengthSeconds', coalesce(track.clip_length_seconds, 5),
    'revealedTitle', case when my_answer.user_id is not null then track.title else null end,
    'revealedArtist', case when my_answer.user_id is not null then track.artist else null end,
    'myScore', coalesce((select points from public.song_guess_scores where user_id = me), 0),
    'tracksReady', (select count(*) from public.song_guess_tracks) >= 4
  );
end;
$$;
grant execute on function public.get_song_guess_round() to authenticated;

create or replace function public.submit_song_guess(p_round_number bigint, p_chosen_index integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cur public.song_guess_round; correct boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into cur from public.song_guess_round where id = 1;
  if cur.round_number <> p_round_number then raise exception 'That round has already ended.'; end if;
  if cur.phase_ends_at <= now() then raise exception 'Too late — that round just ended.'; end if;
  if p_chosen_index < 0 or p_chosen_index > 3 then raise exception 'Invalid choice.'; end if;
  if exists (select 1 from public.song_guess_responses where round_number = p_round_number and user_id = me) then
    raise exception 'You already answered this round.';
  end if;
  correct := p_chosen_index = cur.correct_index;
  insert into public.song_guess_responses (round_number, user_id, chosen_index, is_correct) values (p_round_number, me, p_chosen_index, correct);
  if correct then
    insert into public.song_guess_scores (user_id, points, updated_at) values (me, 1, now())
      on conflict (user_id) do update set points = song_guess_scores.points + 1, updated_at = now();
  end if;
  return jsonb_build_object('success', true, 'isCorrect', correct);
end;
$$;
grant execute on function public.submit_song_guess(bigint, integer) to authenticated;

create or replace function public.fetch_song_guess_leaderboard(p_limit integer default 3) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'username', p.username, 'avatar', p.avatar, 'isVerified', p.is_verified, 'points', s.points) order by s.points desc, s.updated_at asc), '[]'::jsonb)
  from (select * from public.song_guess_scores order by points desc, updated_at asc limit least(greatest(p_limit, 1), 50)) s
  join public.profiles p on p.id = s.user_id;
$$;
grant execute on function public.fetch_song_guess_leaderboard(integer) to authenticated;

create or replace function public.admin_add_song_guess_track(p_title text, p_artist text, p_audio_url text, p_clip_start_seconds integer default 0, p_clip_length_seconds integer default 5) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Enter a song title.'; end if;
  if coalesce(btrim(p_audio_url), '') = '' then raise exception 'Upload an audio clip first.'; end if;
  insert into public.song_guess_tracks (title, artist, audio_url, clip_start_seconds, clip_length_seconds, created_by)
  values (left(btrim(p_title), 100), left(btrim(coalesce(p_artist, '')), 100), p_audio_url, greatest(coalesce(p_clip_start_seconds, 0), 0), greatest(coalesce(p_clip_length_seconds, 5), 1), me);
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.admin_add_song_guess_track(text, text, text, integer, integer) to authenticated;

create or replace function public.admin_list_song_guess_tracks() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'artist', t.artist, 'clipStartSeconds', t.clip_start_seconds, 'clipLengthSeconds', t.clip_length_seconds, 'createdAt', t.created_at
  ) order by t.created_at desc) from public.song_guess_tracks t), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_list_song_guess_tracks() to authenticated;

create or replace function public.admin_delete_song_guess_track(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  delete from public.song_guess_tracks where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.admin_delete_song_guess_track(uuid) to authenticated;
