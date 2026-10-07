-- Photos 2 and 3 of the seeded Manchurian product were wrong (an Unsplash search for
-- "manchurian" surfaced some unrelated results mixed in — flowers and what looked like a dosa —
-- that weren't actually caught before seeding). Photo 1 was correct and is left as-is. The two
-- replacements below were visually checked (not just alt-text matched) before picking them:
-- genuine Indo-Chinese dark-sauce stir-fry dishes, the same style of presentation as Manchurian.

update public.store_products
set media = jsonb_build_array(
  media->0,
  jsonb_build_object('type', 'photo', 'url', 'https://images.unsplash.com/photo-1702705497146-bbde3336a801?w=900&q=80&auto=format&fit=crop'),
  jsonb_build_object('type', 'photo', 'url', 'https://images.unsplash.com/photo-1702705481217-846e30915076?w=900&q=80&auto=format&fit=crop')
)
where category = 'food_stall' and name = 'Manchurian';
