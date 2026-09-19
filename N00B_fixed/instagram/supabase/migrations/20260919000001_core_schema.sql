-- NOOB — core Supabase (Postgres) schema, phase 0.
--
-- Replaces the old "everything is a JSON array in memory, saved wholesale to
-- MongoDB" model with real tables, foreign keys and row-level security, so
-- the browser can talk to Supabase directly with no Express server in
-- between. Every rule the old server enforced in code (who may see what, who
-- may change what, "points can't be edited by the user") lives here instead,
-- in the database, where a client can't skip it.
--
-- How to read the security model:
--   * Every table has row-level security ON. A table with no policy for an
--     action means clients CANNOT do that action at all — it can only happen
--     through a SECURITY DEFINER function (added in later phases) or the
--     service role (imports, Edge Functions).
--   * "protected" columns (points, verification, admin flag, counters...)
--     are additionally guarded by triggers, because RLS can't restrict
--     individual columns.
--
-- Media (avatars, post photos, videos) is stored as text: a B2/Storage object
-- key, an https URL, or a bundled "/path". Resolving keys to viewable URLs is
-- a later phase; this schema doesn't care which store holds the bytes.

-- ===========================================================================
-- Tables
-- ===========================================================================

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  legacy_id         text unique,                      -- old "u_1789..." id, kept for traceability
  username          text not null,
  display_name      text not null default '',
  avatar            text not null default '/noob-logo.svg.jpeg',
  bio               text not null default '',
  account_type      text not null default 'public' check (account_type in ('public', 'private', 'business')),
  is_business       boolean not null default false,
  business_category text,
  is_verified       boolean not null default false,
  verification_tier text check (verification_tier in ('standard', 'plus', 'premium', 'max')),
  is_admin          boolean not null default false,
  is_ai             boolean not null default false,
  is_suspended      boolean not null default false,
  is_live_avatar    boolean not null default false,
  website           text,
  city              text,
  pronouns          text,
  interests         text[] not null default '{}',
  social_links      jsonb not null default '{}',
  external_links    jsonb not null default '[]',
  custom_links      jsonb not null default '[]',
  cross_profiles    jsonb not null default '[]',
  privacy_settings  jsonb not null default '{}',
  status_note       jsonb,
  -- economy (protected: only functions / service role may change these)
  noob_points        bigint not null default 0,
  games_won_count    integer not null default 0,
  games_played_count integer not null default 0,
  pro_tier           text,
  pro_billing        text check (pro_billing in ('monthly', 'yearly')),
  pro_auto_renew     boolean not null default false,
  pro_renews_at      timestamptz,
  purchased_item_ids text[] not null default '{}',
  -- counters maintained by triggers (protected)
  followers_count   integer not null default 0,
  following_count   integer not null default 0,
  posts_count       integer not null default 0,
  -- anything from the old record that has no column of its own (nothing is dropped)
  extra             jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

-- Personal details: only the owner and admins can read these.
create table public.profile_private (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  email              text,
  first_name         text,
  last_name          text,
  country_code       text,
  mobile_number      text,
  date_of_birth      date,
  gender             text,
  business_email     text,
  business_phone     text,
  business_address   text,
  business_addresses text[] not null default '{}',
  ip_address         text,
  agreed_to_terms    boolean not null default false,
  suspended_reason   text,
  push_tokens        text[] not null default '{}',
  legacy             jsonb not null default '{}'      -- original spellings of anything we normalized
);

-- Browser push subscriptions (contain secrets) — owner only; the push
-- Edge Function reads them with the service role.
create table public.push_subscriptions (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  subscription jsonb not null,
  updated_at   timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.posts (
  id                    uuid primary key default gen_random_uuid(),
  legacy_id             text unique,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  caption               text not null default '',
  location              text,
  category              text,
  hashtags              text[] not null default '{}',
  audio_track           jsonb,
  web_link              text,
  text_bg_style         text,
  scheduled_for         timestamptz,
  is_archived           boolean not null default false,
  is_pinned_to_profile  boolean not null default false,
  is_comments_disabled  boolean not null default false,
  is_like_count_hidden  boolean not null default false,
  is_sponsored          boolean not null default false,
  is_collab             boolean not null default false,
  collab_username       text,
  tagged_users          jsonb not null default '[]',
  has_ai_label          boolean not null default false,
  -- counters (protected; likes/saves/comments maintained by triggers)
  likes_count           integer not null default 0,
  comments_count        integer not null default 0,
  saves_count           integer not null default 0,
  shares_count          integer not null default 0,
  extra                 jsonb not null default '{}',
  created_at            timestamptz not null default now()
);
create index posts_user_created_idx on public.posts (user_id, created_at desc);
create index posts_created_idx on public.posts (created_at desc);

create table public.post_slides (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  position      integer not null,
  media_url     text not null,
  media_type    text not null default 'image' check (media_type in ('image', 'video', 'code')),
  caption       text,
  filter        text,
  tagged_users  jsonb not null default '[]',
  product_tags  jsonb not null default '[]',
  unique (post_id, position)
);

create table public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_saves (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_saves_user_idx on public.post_saves (user_id);

create table public.post_views (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.reels (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  video_url       text not null,
  thumbnail_url   text,
  caption         text not null default '',
  audio_title     text,
  audio_artist    text,
  audio_cover_url text,
  hashtags        text[] not null default '{}',
  duration_seconds integer,
  category        text,
  web_link        text,
  is_trial_reel   boolean not null default false,
  is_collab       boolean not null default false,
  collab_username text,
  tagged_users    jsonb not null default '[]',
  -- counters (protected)
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  saves_count     integer not null default 0,
  shares_count    integer not null default 0,
  views_count     integer not null default 0,
  extra           jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index reels_user_created_idx on public.reels (user_id, created_at desc);
create index reels_created_idx on public.reels (created_at desc);

create table public.reel_likes (
  reel_id    uuid not null references public.reels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create table public.reel_saves (
  reel_id    uuid not null references public.reels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create table public.reel_views (
  reel_id    uuid not null references public.reels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

-- Comments on posts OR reels (exactly one of the two).
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  post_id     uuid references public.posts (id) on delete cascade,
  reel_id     uuid references public.reels (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  text        text not null,
  likes_count integer not null default 0,
  is_pinned   boolean not null default false,
  created_at  timestamptz not null default now(),
  check ((post_id is not null) <> (reel_id is not null))
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_reel_idx on public.comments (reel_id, created_at);

-- target_user_id NULL = broadcast to everyone (old "targetUserId: 'all'").
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  target_user_id uuid references public.profiles (id) on delete cascade,
  actor_id       uuid references public.profiles (id) on delete set null,
  type           text not null,
  title          text,
  message        text,
  post_id        uuid references public.posts (id) on delete cascade,
  reel_id        uuid references public.reels (id) on delete cascade,
  chat_id        uuid,
  action_status  text check (action_status in ('pending', 'accepted', 'declined')),
  data           jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index notifications_target_idx on public.notifications (target_user_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  primary key (notification_id, user_id)
);

create table public.chats (
  id                    uuid primary key default gen_random_uuid(),
  legacy_id             text unique,
  name                  text,
  avatar                text,
  description           text,
  is_group              boolean not null default false,
  is_global_default     boolean not null default false,  -- the "Global Lounge": everyone is a member
  creator_id            uuid references public.profiles (id) on delete set null,
  theme_color           text not null default '#00FF66',
  vanish_mode           boolean not null default false,
  read_receipts_enabled boolean not null default true,
  extra                 jsonb not null default '{}',
  created_at            timestamptz not null default now()
);

create table public.chat_members (
  chat_id       uuid not null references public.chats (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  is_admin      boolean not null default false,
  is_pinned     boolean not null default false,
  is_muted      boolean not null default false,
  nickname      text,
  last_read_at  timestamptz,
  joined_at     timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

alter table public.notifications
  add constraint notifications_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete cascade;

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  chat_id     uuid not null references public.chats (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  text        text not null default '',
  media_url   text,
  media_type  text,
  reactions   jsonb not null default '[]',
  reply_to    jsonb,
  is_edited   boolean not null default false,
  is_pinned   boolean not null default false,
  status      text not null default 'sent',
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index messages_chat_created_idx on public.messages (chat_id, created_at);

create table public.game_scores (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  game_id        text not null,
  game_title     text,
  score          integer not null default 0,
  points_awarded bigint not null default 0,
  result         text check (result in ('win', 'tie', 'loss')),
  opponent       text,
  created_at     timestamptz not null default now()
);
create index game_scores_game_idx on public.game_scores (game_id, score desc);

create table public.noob_transactions (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  amount        bigint not null,
  reason        text not null default '',
  balance_after bigint,
  created_at    timestamptz not null default now()
);
create index noob_transactions_user_idx on public.noob_transactions (user_id, created_at desc);

create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text unique,
  code             text not null,
  title            text,
  type             text,
  discount_percent numeric,
  terms            text,
  target_user_id   uuid references public.profiles (id) on delete cascade,  -- NULL = anyone
  created_by       uuid references public.profiles (id) on delete set null,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index coupons_code_lower_key on public.coupons (lower(code));

-- One row of app-wide settings (the old global "settings" object + shop switches).
create table public.app_settings (
  id                 integer primary key default 1 check (id = 1),
  settings           jsonb not null default '{}',
  store_enabled      boolean not null default true,
  store_delivery_fee numeric not null default 0,
  updated_at         timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

create table public.support_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  rating     integer not null check (rating between 1 and 5),
  feedback   text,
  created_at timestamptz not null default now()
);

-- Verbatim copies of small old collections that have no table of their own yet.
create table public.legacy_import (
  key  text primary key,
  data jsonb not null
);

-- ===========================================================================
-- Helper functions (SECURITY DEFINER so policies can use them without
-- recursing into the very tables they protect)
-- ===========================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- May the current user see content authored by `author`?
--   * yourself and admins: always
--   * anyone blocked in either direction: never
--   * public/business accounts: everyone
--   * private accounts: only approved followers
create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    author = auth.uid()
    or public.is_admin()
    or (
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = author and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = author)
      )
      and (
        (select p.account_type from public.profiles p where p.id = author) <> 'private'
        or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = author)
      )
    );
$$;

create or replace function public.is_chat_member(chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chats c where c.id = chat and c.is_global_default)
      or exists (select 1 from public.chat_members m where m.chat_id = chat and m.user_id = auth.uid());
$$;

create or replace function public.is_chat_admin(chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.chats c where c.id = chat and c.creator_id = auth.uid())
      or exists (select 1 from public.chat_members m where m.chat_id = chat and m.user_id = auth.uid() and m.is_admin);
$$;

-- Login is by username OR email, but Supabase Auth logs in by email. Every
-- account's Auth email is a synthetic "<uuid>@users.nooob.xyz" (real emails
-- stay private in profile_private and may repeat across accounts). This maps
-- what the person typed to that login email; it reveals nothing secret and
-- always returns a well-formed address (a random one if nothing matches) so
-- it can't be used to probe which usernames/emails exist.
create or replace function public.resolve_login_email(identifier text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select p.id::text || '@users.nooob.xyz'
      from public.profiles p
      left join public.profile_private pp on pp.user_id = p.id
      where lower(p.username) = lower(btrim(identifier))
         or lower(pp.email) = lower(btrim(identifier))
      order by p.created_at asc
      limit 1
    ),
    gen_random_uuid()::text || '@users.nooob.xyz'
  );
$$;

-- Signup form: "is this username free?" (boolean only).
create or replace function public.username_taken(candidate text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where lower(p.username) = lower(btrim(candidate)));
$$;
revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.username_taken(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.username_taken(text) to anon, authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Keeps a counter column in step with rows of a child table.
--   args: target table, counter column, name of the foreign-key column on the child row
create or replace function public.bump_counter() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fk uuid;
  delta integer;
begin
  if tg_op = 'INSERT' then
    delta := 1;
    fk := (to_jsonb(new) ->> tg_argv[2])::uuid;
  else
    delta := -1;
    fk := (to_jsonb(old) ->> tg_argv[2])::uuid;
  end if;
  if fk is null then
    return null;
  end if;
  execute format('update public.%I set %I = greatest(0, %I + %s) where id = %L',
                 tg_argv[0], tg_argv[1], tg_argv[1], delta, fk);
  return null;
end;
$$;

create trigger follows_followers_count after insert or delete on public.follows
  for each row execute function public.bump_counter('profiles', 'followers_count', 'followee_id');
create trigger follows_following_count after insert or delete on public.follows
  for each row execute function public.bump_counter('profiles', 'following_count', 'follower_id');
create trigger posts_owner_count after insert or delete on public.posts
  for each row execute function public.bump_counter('profiles', 'posts_count', 'user_id');
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.bump_counter('posts', 'likes_count', 'post_id');
create trigger post_saves_count after insert or delete on public.post_saves
  for each row execute function public.bump_counter('posts', 'saves_count', 'post_id');
create trigger comments_post_count after insert or delete on public.comments
  for each row execute function public.bump_counter('posts', 'comments_count', 'post_id');
create trigger comments_reel_count after insert or delete on public.comments
  for each row execute function public.bump_counter('reels', 'comments_count', 'reel_id');
create trigger reel_likes_count after insert or delete on public.reel_likes
  for each row execute function public.bump_counter('reels', 'likes_count', 'reel_id');
create trigger reel_saves_count after insert or delete on public.reel_saves
  for each row execute function public.bump_counter('reels', 'saves_count', 'reel_id');

-- Column guards. RLS decides which ROWS a client may change; these decide
-- which COLUMNS. They only bite for the two browser-facing roles — the
-- service role, SECURITY DEFINER functions and the counter triggers above
-- run as other roles and are unaffected.
create or replace function public.guard_profile_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.legacy_id is distinct from old.legacy_id
       or new.is_verified is distinct from old.is_verified
       or new.verification_tier is distinct from old.verification_tier
       or new.is_admin is distinct from old.is_admin
       or new.is_ai is distinct from old.is_ai
       or new.is_suspended is distinct from old.is_suspended
       or new.noob_points is distinct from old.noob_points
       or new.games_won_count is distinct from old.games_won_count
       or new.games_played_count is distinct from old.games_played_count
       or new.pro_tier is distinct from old.pro_tier
       or new.pro_billing is distinct from old.pro_billing
       or new.pro_auto_renew is distinct from old.pro_auto_renew
       or new.pro_renews_at is distinct from old.pro_renews_at
       or new.purchased_item_ids is distinct from old.purchased_item_ids
       or new.followers_count is distinct from old.followers_count
       or new.following_count is distinct from old.following_count
       or new.posts_count is distinct from old.posts_count
       or new.extra is distinct from old.extra
       or new.created_at is distinct from old.created_at then
      raise exception 'You can''t change protected profile fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_columns();

create or replace function public.guard_post_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.legacy_id is distinct from old.legacy_id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at
       or new.likes_count is distinct from old.likes_count
       or new.comments_count is distinct from old.comments_count
       or new.saves_count is distinct from old.saves_count
       or new.shares_count is distinct from old.shares_count
       or new.extra is distinct from old.extra then
      raise exception 'You can''t change protected post fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger posts_guard before update on public.posts
  for each row execute function public.guard_post_columns();

create or replace function public.guard_reel_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.legacy_id is distinct from old.legacy_id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at
       or new.likes_count is distinct from old.likes_count
       or new.comments_count is distinct from old.comments_count
       or new.saves_count is distinct from old.saves_count
       or new.shares_count is distinct from old.shares_count
       or new.views_count is distinct from old.views_count
       or new.extra is distinct from old.extra then
      raise exception 'You can''t change protected reel fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger reels_guard before update on public.reels
  for each row execute function public.guard_reel_columns();

-- A comment's author, target and like count are fixed; only text/pin edits.
create or replace function public.guard_comment_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.post_id is distinct from old.post_id
       or new.reel_id is distinct from old.reel_id
       or new.likes_count is distinct from old.likes_count
       or new.created_at is distinct from old.created_at then
      raise exception 'You can''t change protected comment fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger comments_guard before update on public.comments
  for each row execute function public.guard_comment_columns();

-- ===========================================================================
-- Row-level security
-- ===========================================================================

alter table public.profiles           enable row level security;
alter table public.profile_private    enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.follows            enable row level security;
alter table public.follow_requests    enable row level security;
alter table public.blocks             enable row level security;
alter table public.posts              enable row level security;
alter table public.post_slides        enable row level security;
alter table public.post_likes         enable row level security;
alter table public.post_saves         enable row level security;
alter table public.post_views         enable row level security;
alter table public.reels              enable row level security;
alter table public.reel_likes         enable row level security;
alter table public.reel_saves         enable row level security;
alter table public.reel_views         enable row level security;
alter table public.comments           enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.chats              enable row level security;
alter table public.chat_members       enable row level security;
alter table public.messages           enable row level security;
alter table public.game_scores        enable row level security;
alter table public.noob_transactions  enable row level security;
alter table public.coupons            enable row level security;
alter table public.app_settings       enable row level security;
alter table public.support_reviews    enable row level security;
alter table public.legacy_import      enable row level security;

-- profiles: every signed-in person can see every profile card (that's how
-- search, follow lists and comments work); you edit only your own, and the
-- guard trigger keeps protected columns out of reach. Rows are created by
-- signup / import, never directly by a client.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy profile_private_select on public.profile_private for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy profile_private_insert on public.profile_private for insert to authenticated
  with check (user_id = auth.uid());
create policy profile_private_update on public.profile_private for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- follows: the follow graph is visible; you follow as yourself, and only
-- accounts that aren't private (private ones go through follow_requests and
-- an accept function). Either side may end the relationship.
create policy follows_select on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and (select p.account_type from public.profiles p where p.id = followee_id) <> 'private'
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = followee_id and b.blocked_id = auth.uid())
                       or (b.blocker_id = auth.uid() and b.blocked_id = followee_id))
  );
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

create policy follow_requests_select on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
create policy follow_requests_insert on public.follow_requests for insert to authenticated
  with check (requester_id = auth.uid());
create policy follow_requests_delete on public.follow_requests for delete to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

create policy blocks_owner on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- posts
create policy posts_select on public.posts for select to authenticated
  using (
    public.can_view_author(user_id)
    and (user_id = auth.uid() or public.is_admin()
         or (not is_archived and (scheduled_for is null or scheduled_for <= now())))
  );
create policy posts_insert on public.posts for insert to authenticated
  with check (user_id = auth.uid());
create policy posts_update on public.posts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Slides follow their post: visible if the post is (the sub-select is itself
-- filtered by posts_select); writable only by the post's author.
create policy post_slides_select on public.post_slides for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_slides_write on public.post_slides for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

create policy post_likes_select on public.post_likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_likes_insert on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated
  using (user_id = auth.uid());

create policy post_saves_owner on public.post_saves for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

-- Who viewed a post: only its author (and admins) can see the list.
create policy post_views_select on public.post_views for select to authenticated
  using (public.is_admin() or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy post_views_insert on public.post_views for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

-- reels
create policy reels_select on public.reels for select to authenticated
  using (public.can_view_author(user_id));
create policy reels_insert on public.reels for insert to authenticated
  with check (user_id = auth.uid());
create policy reels_update on public.reels for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reels_delete on public.reels for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy reel_likes_select on public.reel_likes for select to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_id));
create policy reel_likes_insert on public.reel_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.reels r where r.id = reel_id));
create policy reel_likes_delete on public.reel_likes for delete to authenticated
  using (user_id = auth.uid());

create policy reel_saves_owner on public.reel_saves for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.reels r where r.id = reel_id));

create policy reel_views_select on public.reel_views for select to authenticated
  using (public.is_admin() or exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid()));
create policy reel_views_insert on public.reel_views for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.reels r where r.id = reel_id));

-- comments: readable where the post/reel is; you comment as yourself unless
-- comments are switched off; you (or the post's owner, or an admin) delete;
-- you edit your own text (the post owner's pin goes through a function later).
create policy comments_select on public.comments for select to authenticated
  using (
    (post_id is not null and exists (select 1 from public.posts p where p.id = post_id))
    or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id))
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (post_id is not null and exists (select 1 from public.posts p where p.id = post_id and not p.is_comments_disabled))
      or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id))
    )
  );
create policy comments_update on public.comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- notifications: yours + broadcasts. Created only by triggers / functions /
-- service role; you may mark-read and delete your own.
create policy notifications_select on public.notifications for select to authenticated
  using (target_user_id = auth.uid() or target_user_id is null);
create policy notifications_delete on public.notifications for delete to authenticated
  using (target_user_id = auth.uid());
create policy notification_reads_owner on public.notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chats
create policy chats_select on public.chats for select to authenticated
  using (public.is_chat_member(id));
create policy chats_insert on public.chats for insert to authenticated
  with check (creator_id = auth.uid() and not is_global_default);
create policy chats_update on public.chats for update to authenticated
  using (public.is_chat_admin(id)) with check (public.is_chat_admin(id) and not is_global_default);
create policy chats_delete on public.chats for delete to authenticated
  using (public.is_chat_admin(id) and not is_global_default);

create policy chat_members_select on public.chat_members for select to authenticated
  using (public.is_chat_member(chat_id));
create policy chat_members_update_self on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_members_delete on public.chat_members for delete to authenticated
  using (user_id = auth.uid() or public.is_chat_admin(chat_id));

create policy messages_select on public.messages for select to authenticated
  using (public.is_chat_member(chat_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id));
create policy messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid() or public.is_chat_admin(chat_id));

-- games / wallet: read-only for clients — results and points are written by
-- server-side functions so nobody can grant themselves points.
create policy game_scores_select on public.game_scores for select to authenticated using (true);
create policy noob_transactions_select on public.noob_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy coupons_select on public.coupons for select to authenticated
  using (
    public.is_admin() or created_by = auth.uid()
    or (active and (target_user_id is null or target_user_id = auth.uid()))
  );
create policy coupons_admin_write on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy support_reviews_insert on public.support_reviews for insert to authenticated
  with check (user_id = auth.uid());
create policy support_reviews_admin_select on public.support_reviews for select to authenticated
  using (public.is_admin());

-- legacy_import: no policy on purpose — service role only.

-- ===========================================================================
-- Realtime (live chat / notifications) — only where the publication exists
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications, public.chat_members;
  end if;
end
$$;
