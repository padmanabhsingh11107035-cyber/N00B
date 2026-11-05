-- NOOB Scratch Reveal — people post a picture that is sealed under scratch foil; everybody else scratches it away to see it.
-- Reactions (heart, thumbs up, flame, rocket, skull), comments ("chalk notes"), saves, and a count of how many people scratched a card.
--
-- Purely ADDITIVE: new tables and new functions. Nothing existing is changed or deleted.
-- Who can do what: the tables can be read or written by nobody directly. Everything goes through the functions below, which check who may see whose cards (the same rule as posts:
-- never between blocked people, private accounts only for their followers, the author and the administrator always) and keep limits:
--   * a card: title 1-80 characters, hint up to 120, a picture of the "posts/" folder; 20 new cards per person per day
--   * a comment: 1-300 characters; 60 per person per hour
-- The scratching itself happens in the phone (the foil is drawn over the picture): it is a game of reveal, not a lock. A card's picture is as public as any post picture.

create table if not exists public.scratch_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  hint        text not null default '' check (char_length(hint) <= 120),
  image_key   text not null check (char_length(image_key) between 3 and 300),
  category    text not null default 'Secret Drops' check (char_length(category) between 1 and 40),
  foil        text not null default 'doodle' check (foil in ('doodle', 'silver', 'gold', 'holographic')),
  created_at  timestamptz not null default now()
);
create index if not exists scratch_posts_created_idx on public.scratch_posts (created_at desc);
create index if not exists scratch_posts_user_idx on public.scratch_posts (user_id, created_at desc);

create table if not exists public.scratch_reactions (
  post_id    uuid not null references public.scratch_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('heart', 'thumb', 'flame', 'rocket', 'skull')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table if not exists public.scratch_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.scratch_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists scratch_comments_post_idx on public.scratch_comments (post_id, created_at desc);

create table if not exists public.scratch_saves (
  post_id    uuid not null references public.scratch_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.scratch_reveals (
  post_id    uuid not null references public.scratch_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.scratch_posts     enable row level security;
alter table public.scratch_reactions enable row level security;
alter table public.scratch_comments  enable row level security;
alter table public.scratch_saves     enable row level security;
alter table public.scratch_reveals   enable row level security;
revoke all on public.scratch_posts, public.scratch_reactions, public.scratch_comments, public.scratch_saves, public.scratch_reveals from public, anon, authenticated;
grant all on public.scratch_posts, public.scratch_reactions, public.scratch_comments, public.scratch_saves, public.scratch_reveals to service_role;

-- one card as the app shows it (only called from inside the functions below, which check who may see it)
create or replace function public.scratch_card_json(p public.scratch_posts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'userId', p.user_id,
    'username', pr.username,
    'displayName', coalesce(nullif(pr.display_name, ''), pr.username),
    'avatar', pr.avatar,
    'isVerified', coalesce(pr.is_verified, false),
    'title', p.title,
    'hint', p.hint,
    'image', p.image_key,
    'category', p.category,
    'foil', p.foil,
    'createdAt', p.created_at,
    'isMine', p.user_id = auth.uid(),
    'counts', jsonb_build_object(
      'heart',  (select count(*) from public.scratch_reactions r where r.post_id = p.id and r.kind = 'heart'),
      'thumb',  (select count(*) from public.scratch_reactions r where r.post_id = p.id and r.kind = 'thumb'),
      'flame',  (select count(*) from public.scratch_reactions r where r.post_id = p.id and r.kind = 'flame'),
      'rocket', (select count(*) from public.scratch_reactions r where r.post_id = p.id and r.kind = 'rocket'),
      'skull',  (select count(*) from public.scratch_reactions r where r.post_id = p.id and r.kind = 'skull')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.scratch_reactions r where r.post_id = p.id and r.user_id = auth.uid()), '[]'::jsonb),
    'comments', (select count(*) from public.scratch_comments c where c.post_id = p.id),
    'scratchers', (select count(*) from public.scratch_reveals v where v.post_id = p.id),
    'saved', exists (select 1 from public.scratch_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    'revealed', exists (select 1 from public.scratch_reveals v where v.post_id = p.id and v.user_id = auth.uid())
  )
  from public.profiles pr where pr.id = p.user_id;
$$;
revoke execute on function public.scratch_card_json(public.scratch_posts) from public, anon, authenticated;

-- the feed: newest first, optional word of the category, optional "older than" cursor; only cards this person may see
create or replace function public.scratch_feed(p_category text default null, p_before timestamptz default null, p_limit int default 12, p_saved boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_lim int := least(greatest(coalesce(p_limit, 12), 1), 30); v_out jsonb;
begin
  if me is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.scratch_card_json(x.sp) order by (x.sp).created_at desc), '[]'::jsonb) into v_out
  from (
    select p as sp from public.scratch_posts p
    where public.can_view_author(p.user_id)
      and (p_before is null or p.created_at < p_before)
      and (p_category is null or p_category = '' or lower(p.category) like '%' || lower(p_category) || '%')
      and (not coalesce(p_saved, false) or exists (select 1 from public.scratch_saves s where s.post_id = p.id and s.user_id = me))
    order by p.created_at desc
    limit v_lim
  ) x;
  return v_out;
end;
$$;

create or replace function public.scratch_create(p_title text, p_hint text, p_image text, p_category text, p_foil text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_hint text := btrim(coalesce(p_hint, ''));
  v_cat text := btrim(coalesce(p_category, ''));
  v_foil text := case when p_foil in ('doodle', 'silver', 'gold', 'holographic') then p_foil else 'doodle' end;
  v_row public.scratch_posts;
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then return jsonb_build_object('success', false, 'error', 'Give the card a title of up to 80 characters.'); end if;
  if char_length(v_hint) > 120 then return jsonb_build_object('success', false, 'error', 'The hint can be up to 120 characters.'); end if;
  if v_cat = '' then v_cat := 'Secret Drops'; end if;
  if char_length(v_cat) > 40 then v_cat := left(v_cat, 40); end if;
  if p_image is null or p_image !~ '^posts/[A-Za-z0-9_./-]+$' or p_image like '%..%' then return jsonb_build_object('success', false, 'error', 'The picture was not uploaded. Please try again.'); end if;
  if (select count(*) from public.scratch_posts where user_id = me and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('success', false, 'error', 'You have posted 20 scratch cards today. Try again tomorrow.');
  end if;
  insert into public.scratch_posts (user_id, title, hint, image_key, category, foil) values (me, v_title, v_hint, p_image, v_cat, v_foil) returning * into v_row;
  return jsonb_build_object('success', true, 'card', public.scratch_card_json(v_row));
end;
$$;

-- delete a card: its author or the administrator; the picture goes to the deletion queue
create or replace function public.scratch_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts;
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found then return jsonb_build_object('success', true); end if;
  if v_row.user_id <> me and not public.is_admin() then return jsonb_build_object('success', false, 'error', 'Only the author can delete this card.'); end if;
  delete from public.scratch_posts where id = p_id;
  perform public.queue_media_trash(v_row.image_key, 'scratch card deleted');
  return jsonb_build_object('success', true);
end;
$$;

-- tap a reaction: on if it was off, off if it was on; answers with the new counts
create or replace function public.scratch_react(p_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts;
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  if p_kind not in ('heart', 'thumb', 'flame', 'rocket', 'skull') then return jsonb_build_object('success', false, 'error', 'Unknown reaction.'); end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found or not public.can_view_author(v_row.user_id) then return jsonb_build_object('success', false, 'error', 'This card is not available.'); end if;
  if exists (select 1 from public.scratch_reactions where post_id = p_id and user_id = me and kind = p_kind) then
    delete from public.scratch_reactions where post_id = p_id and user_id = me and kind = p_kind;
  else
    insert into public.scratch_reactions (post_id, user_id, kind) values (p_id, me, p_kind) on conflict do nothing;
  end if;
  return jsonb_build_object('success', true, 'card', public.scratch_card_json(v_row));
end;
$$;

create or replace function public.scratch_save(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts;
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found or not public.can_view_author(v_row.user_id) then return jsonb_build_object('success', false, 'error', 'This card is not available.'); end if;
  if exists (select 1 from public.scratch_saves where post_id = p_id and user_id = me) then
    delete from public.scratch_saves where post_id = p_id and user_id = me;
  else
    insert into public.scratch_saves (post_id, user_id) values (p_id, me) on conflict do nothing;
  end if;
  return jsonb_build_object('success', true, 'card', public.scratch_card_json(v_row));
end;
$$;

-- "I scratched this card open" (counted once per person)
create or replace function public.scratch_reveal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts;
begin
  if me is null then return jsonb_build_object('success', false); end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found or not public.can_view_author(v_row.user_id) then return jsonb_build_object('success', false); end if;
  insert into public.scratch_reveals (post_id, user_id) values (p_id, me) on conflict do nothing;
  return jsonb_build_object('success', true, 'card', public.scratch_card_json(v_row));
end;
$$;

create or replace function public.scratch_comments(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts;
begin
  if me is null then return '[]'::jsonb; end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found or not public.can_view_author(v_row.user_id) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'userId', c.user_id, 'username', pr.username, 'displayName', coalesce(nullif(pr.display_name, ''), pr.username),
      'avatar', pr.avatar, 'isVerified', coalesce(pr.is_verified, false), 'body', c.body, 'createdAt', c.created_at,
      'canDelete', c.user_id = me or v_row.user_id = me or public.is_admin()) order by c.created_at desc)
    from (select * from public.scratch_comments where post_id = p_id order by created_at desc limit 200) c
    join public.profiles pr on pr.id = c.user_id
    where not exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = c.user_id) or (b.blocker_id = c.user_id and b.blocked_id = me))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.scratch_comment(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_row public.scratch_posts; v_body text := btrim(coalesce(p_body, ''));
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then return jsonb_build_object('success', false, 'error', 'A note is 1 to 300 characters.'); end if;
  select * into v_row from public.scratch_posts where id = p_id;
  if not found or not public.can_view_author(v_row.user_id) then return jsonb_build_object('success', false, 'error', 'This card is not available.'); end if;
  if (select count(*) from public.scratch_comments where user_id = me and created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('success', false, 'error', 'Too many notes in a short time. Please wait a little.');
  end if;
  insert into public.scratch_comments (post_id, user_id, body) values (p_id, me, v_body);
  return jsonb_build_object('success', true, 'card', public.scratch_card_json(v_row));
end;
$$;

create or replace function public.scratch_comment_delete(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_c public.scratch_comments; v_owner uuid;
begin
  if me is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  select * into v_c from public.scratch_comments where id = p_comment;
  if not found then return jsonb_build_object('success', true); end if;
  select user_id into v_owner from public.scratch_posts where id = v_c.post_id;
  if v_c.user_id <> me and v_owner <> me and not public.is_admin() then return jsonb_build_object('success', false, 'error', 'You cannot delete this note.'); end if;
  delete from public.scratch_comments where id = p_comment;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.scratch_feed(text, timestamptz, int, boolean), public.scratch_create(text, text, text, text, text), public.scratch_delete(uuid), public.scratch_react(uuid, text),
  public.scratch_save(uuid), public.scratch_reveal(uuid), public.scratch_comments(uuid), public.scratch_comment(uuid, text), public.scratch_comment_delete(uuid) from public, anon;
grant execute on function public.scratch_feed(text, timestamptz, int, boolean), public.scratch_create(text, text, text, text, text), public.scratch_delete(uuid), public.scratch_react(uuid, text),
  public.scratch_save(uuid), public.scratch_reveal(uuid), public.scratch_comments(uuid), public.scratch_comment(uuid, text), public.scratch_comment_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
