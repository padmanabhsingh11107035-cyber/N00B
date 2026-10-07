-- Guess the Song never had enough tracks to run because curating 4+ copyright-cleared audio files by
-- hand was a real blocker. This switches the source to YouTube's own officially embeddable IFrame
-- Player (no extraction/download — the admin just pastes a YouTube link) so there's always content.
-- The actual player stays off-screen during play (the video itself would usually show the title/
-- artist as on-screen graphics and give the answer away) while the UI shows a clear "Playing from
-- YouTube" indicator, so it's honest about the source without wrecking the guessing game.

alter table public.song_guess_tracks alter column audio_url drop not null;
alter table public.song_guess_tracks alter column audio_url set default '';
alter table public.song_guess_tracks add column if not exists youtube_video_id text;

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
    'clipUrl', nullif(track.audio_url, ''),
    'youtubeVideoId', track.youtube_video_id,
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

drop function if exists public.admin_add_song_guess_track(text, text, text, integer, integer);
create function public.admin_add_song_guess_track(
  p_title text, p_artist text, p_audio_url text default '', p_clip_start_seconds integer default 0,
  p_clip_length_seconds integer default 5, p_youtube_video_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Enter a song title.'; end if;
  if coalesce(btrim(p_audio_url), '') = '' and coalesce(btrim(p_youtube_video_id), '') = '' then
    raise exception 'Paste a YouTube link for this song.';
  end if;
  insert into public.song_guess_tracks (title, artist, audio_url, youtube_video_id, clip_start_seconds, clip_length_seconds, created_by)
  values (
    left(btrim(p_title), 100), left(btrim(coalesce(p_artist, '')), 100), coalesce(p_audio_url, ''),
    nullif(btrim(coalesce(p_youtube_video_id, '')), ''), greatest(coalesce(p_clip_start_seconds, 0), 0), greatest(coalesce(p_clip_length_seconds, 5), 1), me
  );
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.admin_add_song_guess_track(text, text, text, integer, integer, text) to authenticated;

create or replace function public.admin_list_song_guess_tracks() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'artist', t.artist, 'youtubeVideoId', t.youtube_video_id,
    'clipStartSeconds', t.clip_start_seconds, 'clipLengthSeconds', t.clip_length_seconds, 'createdAt', t.created_at
  ) order by t.created_at desc) from public.song_guess_tracks t), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_list_song_guess_tracks() to authenticated;
