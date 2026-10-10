-- "New to you first": the Feed and Reels put posts/reels a person hasn't seen yet on top (newest
-- first) and shuffle everything they've already seen behind them. The app already records every
-- view (post_views / reel_views) — but a viewer can't read post_views directly (only the post's
-- author can), so this adds one small read-only function that tells the signed-in person which of
-- the latest posts/reels they have already viewed. It only ever returns the caller's OWN views,
-- changes no table and no existing function, and the app works without it (it then relies on what
-- the device itself remembers).

create or replace function public.my_seen_content() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(v.post_id)
      from public.post_views v
      where v.user_id = auth.uid()
        and v.post_id in (select p.id from public.posts p order by p.created_at desc limit 500)
    ), '[]'::jsonb),
    'reels', coalesce((
      select jsonb_agg(v.reel_id)
      from public.reel_views v
      where v.user_id = auth.uid()
        and v.reel_id in (select r.id from public.reels r order by r.created_at desc limit 300)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.my_seen_content() from public;
grant execute on function public.my_seen_content() to authenticated;
