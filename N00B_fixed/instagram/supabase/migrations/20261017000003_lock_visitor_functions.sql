-- NOOB - close the doors a logged-out visitor should not have.
--
-- Found by scripts/live-check-exposure.mjs, which calls every database function as a stranger holding only the public key. These ran for a stranger because they were only ever
-- GRANTED to logged-in people, never taken away from everyone else (a new function is open to everybody until it is closed):
--   generate_suggested_user_notifications  - writes notifications for every account; it belongs to the twice-a-day job only (the job runs as the database itself)
--   settings_defaults / settings_enums     - helpers of the settings functions (the database calls them itself)
--   get_daily_challenge, fetch_daily_challenge_entries, fetch_daily_champions, fetch_song_guess_leaderboard, get_song_guess_round, list_noob_rooms
--                                          - pages of the logged-in app (get_daily_challenge also settles the day, which a stranger should not be able to trigger)
-- The functions that are meant for visitors (the public Anonymous Messages, polls and This or That pages, the sign-up helpers, the platform's public settings) are untouched.
--
-- Safe to run again.

revoke execute on function public.generate_suggested_user_notifications() from public, anon, authenticated;
revoke execute on function public.settings_defaults() from public, anon, authenticated;
revoke execute on function public.settings_enums() from public, anon, authenticated;

revoke execute on function public.get_daily_challenge() from public, anon;
revoke execute on function public.fetch_daily_challenge_entries(date) from public, anon;
revoke execute on function public.fetch_daily_champions(integer) from public, anon;
revoke execute on function public.fetch_song_guess_leaderboard(integer) from public, anon;
revoke execute on function public.get_song_guess_round() from public, anon;
revoke execute on function public.list_noob_rooms() from public, anon;

grant execute on function public.get_daily_challenge() to authenticated;
grant execute on function public.fetch_daily_challenge_entries(date) to authenticated;
grant execute on function public.fetch_daily_champions(integer) to authenticated;
grant execute on function public.fetch_song_guess_leaderboard(integer) to authenticated;
grant execute on function public.get_song_guess_round() to authenticated;
grant execute on function public.list_noob_rooms() to authenticated;
