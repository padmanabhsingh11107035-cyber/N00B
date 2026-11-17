-- "AI info" label on posts. The post table already has a column has_ai_label (and every post answer already carries it as hasAiLabel), but nothing could ever switch it on: create_post does not
-- take it. This adds the way to switch it on, and remembers WHY a post carries the label, so the label can say it honestly:
--   'creator'  = the person who made the post said it is made with AI,
--   'detected' = NOOB's phone / browser found a standard "made by AI" marker inside the picture or video file (IPTC digital source type, C2PA Content Credentials, a known generator's tag).
-- Rules: only the author can label their own post; a label is only ever switched ON here (a detected label can not be turned off by the author; nobody can switch a label off through the app);
-- 'detected' wins over 'creator'. Everything else about posts is untouched (create_post / post_json are not changed). Safe to run more than once.

create table if not exists public.post_ai_source (
  post_id uuid primary key references public.posts (id) on delete cascade,
  source text not null check (source in ('creator', 'detected')),
  created_at timestamptz not null default now()
);
alter table public.post_ai_source enable row level security;
revoke all on public.post_ai_source from public, anon, authenticated;

create or replace function public.post_ai_label_set(p_post uuid, p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  src text := case when p_source = 'detected' then 'detected' else 'creator' end;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.posts where id = p_post and user_id = me) then raise exception 'You can only label your own posts.' using errcode = '42501'; end if;
  update public.posts set has_ai_label = true where id = p_post;
  insert into public.post_ai_source (post_id, source) values (p_post, src)
    on conflict (post_id) do update set source = case when public.post_ai_source.source = 'detected' or excluded.source = 'detected' then 'detected' else 'creator' end;
  return jsonb_build_object('ok', true, 'source', (select source from public.post_ai_source where post_id = p_post));
end;
$$;
revoke execute on function public.post_ai_label_set(uuid, text) from public, anon;
grant execute on function public.post_ai_label_set(uuid, text) to authenticated;

-- Why a post carries the label (asked when someone taps the label). Only for a post this person may see.
create or replace function public.post_ai_info(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.posts; src text;
begin
  select * into p from public.posts where id = p_post;
  if not found or not p.has_ai_label or not public.can_view_author(p.user_id) then return null; end if;
  select source into src from public.post_ai_source where post_id = p_post;
  return jsonb_build_object('source', coalesce(src, 'creator'));
end;
$$;
revoke execute on function public.post_ai_info(uuid) from public, anon;
grant execute on function public.post_ai_info(uuid) to authenticated;
