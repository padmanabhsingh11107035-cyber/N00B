-- Removes the Scratch Reveal feature's data for good: every posted card, its reactions, notes, saves and reveals.
-- NOT touched: the birthday-gift scratch cards (table scratch_cards, function reveal_scratch_card) - a different feature.
-- The pictures of the cards are put in the storage cleanup queue (media_trash), so the files are deleted from storage after the usual 24 hours.
-- This cannot be undone: run it once you are sure.

do $$
begin
  if to_regclass('public.scratch_posts') is not null then
    perform public.queue_media_trash(image_key, 'scratch reveal feature removed') from public.scratch_posts;
  end if;
end $$;

drop function if exists public.scratch_feed(text, timestamptz, int, boolean);
drop function if exists public.scratch_create(text, text, text, text, text);
drop function if exists public.scratch_delete(uuid);
drop function if exists public.scratch_react(uuid, text);
drop function if exists public.scratch_save(uuid);
drop function if exists public.scratch_reveal(uuid);
drop function if exists public.scratch_comments(uuid);
drop function if exists public.scratch_comment(uuid, text);
drop function if exists public.scratch_comment_delete(uuid);
drop function if exists public.scratch_card_json(public.scratch_posts);

drop table if exists public.scratch_reveals;
drop table if exists public.scratch_saves;
drop table if exists public.scratch_comments;
drop table if exists public.scratch_reactions;
drop table if exists public.scratch_posts;
