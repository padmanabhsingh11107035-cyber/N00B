-- The new scroll-assembly Food Stall hero (a drop-in visual module, no backend of its own) covers
-- five items: Burger, Fries, Manchurian, Cola and Diet Cola. The first three and "Cola" already map
-- onto real store_products rows; Diet Cola never existed as a real product, so without this it would
-- be a purely decorative "Add to cart" with nothing real behind it. Adding it as a genuine
-- category='food_stall' product keeps every item in the hero backed by real, admin-editable stock
-- and price — same admin panel (AdminFoodStallPanel), no new code there.
insert into public.store_products (name, price, description, media, in_stock, category)
select 'Diet Coke', 59, 'Chilled Diet Coke, zero sugar, served ice-cold.',
  jsonb_build_array(jsonb_build_object('type', 'photo', 'url', '/food-hero/assets/diet-cola.webp')),
  true, 'food_stall'
where not exists (select 1 from public.store_products where name = 'Diet Coke' and category = 'food_stall');
