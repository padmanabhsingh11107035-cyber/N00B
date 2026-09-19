-- One-off cleanup (run once in the Supabase SQL Editor).
--
-- The owner decided NOT to move reels or chat history to the new system, but the first
-- import (before that decision) had already loaded them. This removes exactly those rows.
-- Everything is still in the raw MongoDB backup, and nothing else is touched:
-- accounts, posts, photos, likes, follows, points, scores, transactions, coupons stay.

-- The 2 reels — also removes their likes, views, saves, comments, and the notifications about them.
delete from public.reels;

-- Global Lounge chat history (the empty Global Lounge room itself stays: the app needs its default room).
delete from public.messages;

-- Notifications that only say "someone sent you a message" (they point at chats that are not moved).
delete from public.notifications where type = 'new_message';

-- The old list of recently watched reels.
delete from public.legacy_import where key = 'reelHistory';

-- Expected result: reels 0, messages 0, chats 1, notifications 77, profiles 21, posts 10.
select
  (select count(*) from public.reels)         as reels,
  (select count(*) from public.messages)      as messages,
  (select count(*) from public.chats)         as chats,
  (select count(*) from public.notifications) as notifications,
  (select count(*) from public.profiles)      as profiles,
  (select count(*) from public.posts)         as posts;
