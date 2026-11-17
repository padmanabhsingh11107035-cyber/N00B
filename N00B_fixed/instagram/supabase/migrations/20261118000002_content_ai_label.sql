-- "AI info" label on reels and stories (posts have theirs since 20261117000002).
-- reel_json / story_json are NOT changed (they carry too much to touch safely): the label lives in its own small table and the app asks for it, by ids, for what is on the screen.
--   'creator'  = the person who made it said it is made with AI,
--   'detected' = the phone found a standard "made by AI" marker inside the picture / video file.
-- Rules: only the owner can label their own reel / story; a label is only ever switched ON (never off through the app); 'detected' wins over 'creator'; only people who may see the owner's
-- content learn about the label. When the reel or story is deleted (or a story expires and is removed) its label row goes with it. Safe to run more than once.

create table if not exists public.content_ai_source (
  kind text not null check (kind in ('reel', 'story')),
  content_id uuid not null,
  source text not null check (source in ('creator', 'detected')),
  created_at timestamptz not null default now(),
  primary key (kind, content_id)
);
alter table public.content_ai_source enable row level security;
revoke all on public.content_ai_source from public, anon, authenticated;

create or replace function public.content_ai_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.content_ai_source where kind = tg_argv[0] and content_id = old.id;
  return old;
end;
$$;
revoke execute on function public.content_ai_cleanup() from public, anon, authenticated;

drop trigger if exists reels_ai_cleanup on public.reels;
create trigger reels_ai_cleanup after delete on public.reels for each row execute function public.content_ai_cleanup('reel');
drop trigger if exists stories_ai_cleanup on public.stories;
create trigger stories_ai_cleanup after delete on public.stories for each row execute function public.content_ai_cleanup('story');

create or replace function public.content_ai_label_set(p_kind text, p_id uuid, p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  src text := case when p_source = 'detected' then 'detected' else 'creator' end;
  mine boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_kind not in ('reel', 'story') then raise exception 'Nothing to label.'; end if;
  mine := case p_kind
    when 'reel' then exists (select 1 from public.reels where id = p_id and user_id = me)
    else exists (select 1 from public.stories where id = p_id and user_id = me) end;
  if not mine then raise exception 'You can only label your own content.' using errcode = '42501'; end if;
  insert into public.content_ai_source (kind, content_id, source) values (p_kind, p_id, src)
    on conflict (kind, content_id) do update set source = case when public.content_ai_source.source = 'detected' or excluded.source = 'detected' then 'detected' else 'creator' end;
  return jsonb_build_object('ok', true, 'source', (select source from public.content_ai_source where kind = p_kind and content_id = p_id));
end;
$$;
revoke execute on function public.content_ai_label_set(text, uuid, text) from public, anon;
grant execute on function public.content_ai_label_set(text, uuid, text) to authenticated;

-- Which of these reels / stories carry the label (and why), for the ones this person may see. At most 100 ids at a time.
create or replace function public.content_ai_labels(p_kind text, p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_kind not in ('reel', 'story') or p_ids is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.content_id, 'source', c.source)), '[]'::jsonb) into out
  from public.content_ai_source c
  where c.kind = p_kind and c.content_id = any (p_ids[1:100])
    and public.can_view_author(case p_kind
      when 'reel' then (select user_id from public.reels where id = c.content_id)
      else (select user_id from public.stories where id = c.content_id) end);
  return out;
end;
$$;
revoke execute on function public.content_ai_labels(text, uuid[]) from public, anon;
grant execute on function public.content_ai_labels(text, uuid[]) to authenticated;
