-- "Comments load very slow": post_comments/reel_comments/long_video_comments were plain `stable`
-- functions (not security definer), so every row they touch gets RLS re-evaluated on top of the
-- function's own logic. That stacks up per comment: comments_select's own `exists (select 1 from
-- posts/reels/long_videos ...)` check, PLUS comment_json's per-row isLiked lookup against
-- comment_likes, which itself re-runs comment_likes_select's `exists (select 1 from comments ...)`
-- check — two extra correlated subqueries per comment row, on top of the real work. None of that
-- RLS is actually adding a privacy check these functions don't already make by construction (they
-- only ever select comments for the one post/reel/video id passed in), so bypassing it via security
-- definer is free correctness-wise and removes real, stacking per-row overhead.

create or replace function public.post_comments(p_post uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.post_id = p_post;
$$;

create or replace function public.reel_comments(p_reel uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.reel_id = p_reel;
$$;

create or replace function public.long_video_comments(p_video uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.long_video_id = p_video;
$$;
