-- NOOB — Supabase phase 9: LANGUAGES.
-- People can choose the language the app is shown in. The app's own texts (menus, buttons, messages) are translated once, by the
-- server, and kept here so that every later person using that language gets them instantly. Nothing a person writes (posts,
-- comments, chats, names) is ever stored here or translated by this table.
--   * ui_translations       one row per (language, text): the translation. Anybody may READ the translations (they are only the app's
--                           own labels); nobody can write to it except the server's translator (the Edge Function).
--   * ui_translation_usage  counters that keep the translator from being abused (how many new texts per hour / per day).
-- Safe to run more than once. Nothing else is changed (a person's chosen language is kept in their login profile, not in a table here).

create table if not exists public.ui_translations (
  lang       text not null check (lang ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  text_id    text not null check (text_id ~ '^[0-9a-z]{1,16}$'),
  translated text not null check (char_length(translated) between 1 and 1200),
  created_at timestamptz not null default now(),
  primary key (lang, text_id)
);
alter table public.ui_translations enable row level security;
revoke all on public.ui_translations from anon, authenticated;
grant all on public.ui_translations to service_role;

create table if not exists public.ui_translation_usage (
  bucket     text primary key,                       -- e.g. 'day:2026-09-20' or 'ip:203.0.113.5:2026-09-20T14'
  n          integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ui_translation_usage enable row level security;
revoke all on public.ui_translation_usage from anon, authenticated;
grant all on public.ui_translation_usage to service_role;

-- Every stored translation for one language, as { "<text id>": "<translation>" } (one quick call when a person opens the app).
-- Works for visitors who are not logged in yet, because the login and sign-up screens are translated too.
create or replace function public.get_ui_translations(p_lang text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(text_id, translated), '{}'::jsonb) from public.ui_translations where lang = p_lang;
$$;

-- Spend some of a limit: adds p_amount to the counter unless that would go over p_limit. Returns whether it was allowed.
-- (Only the server's translator can call it.)
create or replace function public.ui_usage_take(p_bucket text, p_amount integer, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_amount < 0 or p_limit < 0 then return false; end if;
  insert into public.ui_translation_usage (bucket, n) values (p_bucket, 0) on conflict (bucket) do nothing;
  update public.ui_translation_usage set n = n + p_amount, updated_at = now() where bucket = p_bucket and n + p_amount <= p_limit;
  if not found then return false; end if;
  if random() < 0.02 then delete from public.ui_translation_usage where updated_at < now() - interval '3 days'; end if;  -- tidy old counters
  return true;
end;
$$;

revoke execute on function public.get_ui_translations(text), public.ui_usage_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_ui_translations(text) to anon, authenticated, service_role;
grant execute on function public.ui_usage_take(text, integer, integer) to service_role;
