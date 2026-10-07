-- A correct Guess the Song answer now also credits 1,000,000 real NOOB Points to the player's
-- account instantly (on top of the existing +1 bump to song_guess_scores, which stays as the
-- separate Top 3 leaderboard ranking for this game specifically, not real currency). Confirmed with
-- the user: yes, this is a very large, fully repeatable reward (a round runs every ~20 seconds) —
-- intentional, not a balancing mistake.
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
    perform public.award_points(me, 1000000, 'Guess the Song — correct guess');
  end if;
  return jsonb_build_object('success', true, 'isCorrect', correct);
end;
$$;
grant execute on function public.submit_song_guess(bigint, integer) to authenticated;
