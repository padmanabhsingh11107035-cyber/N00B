-- A logged-out visitor could call history_long_videos() (it returned an empty list, because it checks who is calling, so nothing leaked). It was meant for signed-in people only:
-- the grant to everybody (PUBLIC) that functions get by default is taken away, and only signed-in accounts keep it. Safe to run more than once.
revoke execute on function public.history_long_videos() from public, anon;
grant execute on function public.history_long_videos() to authenticated;
