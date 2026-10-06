-- Posting a video comment has been failing outright. The most likely cause: 20261006000005's
-- dynamic lookup for the ORIGINAL "(post_id is not null) <> (reel_id is not null)" check
-- constraint (auto-named by Postgres, never given an explicit name) didn't find/drop it, so it
-- stayed in place alongside the new three-way constraint. For a video-only comment (post_id and
-- reel_id both null), that old constraint evaluates to false (false <> false) and rejects the
-- insert outright, regardless of long_video_id being set correctly - exactly a post attempt
-- failing without a specific database error ever reaching the UI.
--
-- This re-runs the same cleanup, independent of whatever happened the first time: finds every
-- check constraint on comments that still enforces post/reel exclusivity WITHOUT accounting for
-- long_video_id, drops it, and re-asserts the three-way version. Safe to run even if the first
-- attempt actually worked - there would be nothing left to find or drop.
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'comments' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%post_id%'
      and pg_get_constraintdef(con.oid) ilike '%reel_id%'
      and pg_get_constraintdef(con.oid) not ilike '%long_video_id%'
  loop
    execute format('alter table public.comments drop constraint %I', r.conname);
  end loop;
end
$$;

alter table public.comments drop constraint if exists comments_target_check;
alter table public.comments add constraint comments_target_check check (
  (case when post_id is not null then 1 else 0 end)
  + (case when reel_id is not null then 1 else 0 end)
  + (case when long_video_id is not null then 1 else 0 end) = 1
);
