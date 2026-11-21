-- "Interested" / "Not interested" on a post or reel (the three-dot sheet), kept on the server so it follows the person to every phone and can shape what they see:
--   * a post or reel marked "Not interested" is not shown to that person again;
--   * when the reason "I do not like this account" was ticked, every post and reel of that account is hidden from that person's Home and Reels;
--   * the reasons are kept (they help NOOB see what people dislike).
-- Purely ADDITIVE: one new table and two functions; nothing existing is changed. The table is reachable only through the functions, and each person sees only their own rows.

create table if not exists public.feed_interest (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('post', 'reel')),
  item_id    uuid not null,
  author_id  uuid references public.profiles (id) on delete cascade,
  value      text not null check (value in ('yes', 'no')),
  reasons    text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);
create index if not exists feed_interest_user_idx on public.feed_interest (user_id, created_at desc);
alter table public.feed_interest enable row level security;
revoke all on public.feed_interest from public, anon, authenticated;
grant all on public.feed_interest to service_role;

-- Saves (or, with p_value null, takes back) the person's answer for one post or reel.
create or replace function public.set_feed_interest(p_kind text, p_item uuid, p_value text default null, p_reasons text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_author uuid; v_reasons text[];
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_kind not in ('post', 'reel') then raise exception 'Unknown kind'; end if;
  if p_value is null then
    delete from public.feed_interest where user_id = me and kind = p_kind and item_id = p_item;
    return jsonb_build_object('success', true);
  end if;
  if p_value not in ('yes', 'no') then raise exception 'Unknown answer'; end if;
  if p_kind = 'post' then select user_id into v_author from public.posts where id = p_item;
  else select user_id into v_author from public.reels where id = p_item; end if;
  select coalesce(array_agg(left(r, 140)), '{}') into v_reasons from (select r from unnest(coalesce(p_reasons, '{}')) r limit 8) q;
  insert into public.feed_interest (user_id, kind, item_id, author_id, value, reasons)
  values (me, p_kind, p_item, v_author, p_value, v_reasons)
  on conflict (user_id, kind, item_id) do update set value = excluded.value, reasons = excluded.reasons, author_id = coalesce(excluded.author_id, public.feed_interest.author_id), created_at = now();
  -- only the newest 500 answers are kept
  delete from public.feed_interest f where f.user_id = me and f.created_at < (select min(created_at) from (select created_at from public.feed_interest where user_id = me order by created_at desc limit 500) k);
  return jsonb_build_object('success', true);
end;
$$;

-- The person's own answers, and the accounts they do not want to see.
create or replace function public.my_feed_interest() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  return jsonb_build_object(
    'no',  coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'id', item_id)) from public.feed_interest where user_id = me and value = 'no'), '[]'::jsonb),
    'yes', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'id', item_id)) from public.feed_interest where user_id = me and value = 'yes'), '[]'::jsonb),
    'hiddenAuthors', coalesce((select jsonb_agg(distinct author_id) from public.feed_interest f where f.user_id = me and f.value = 'no' and f.author_id is not null and exists (select 1 from unnest(f.reasons) r where r ilike '%account%')), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.set_feed_interest(text, uuid, text, text[]), public.my_feed_interest() from public, anon;
grant execute on function public.set_feed_interest(text, uuid, text, text[]), public.my_feed_interest() to authenticated;
