-- NOOB — fetch a single post/reel by id, respecting the same visibility rules as viewing it
-- normally (blocks, hidden profiles, private accounts). Same shape and precedent as story_by_id
-- (20260925000039): the shared-link/shared-in-chat "open this exact post/reel" flow previously only
-- searched whatever was ALREADY loaded in the viewer's own feed/reels list, so a post or reel from
-- someone not in that locally-loaded set (a different account, or simply not on the current page)
-- silently fell back to opening the generic feed/reels screen instead. This is the real fetch it was
-- missing.

create or replace function public.post_by_id(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid; archived boolean;
begin
  select user_id, is_archived into owner, archived from public.posts where id = p_post;
  if owner is null or archived then return null; end if;
  if owner <> auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this post.' using errcode = '42501'; end if;
  return (select public.post_json(p) from public.posts p where p.id = p_post);
end;
$$;

create or replace function public.reel_by_id(p_reel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then return null; end if;
  if owner <> auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this reel.' using errcode = '42501'; end if;
  return (select public.reel_json(r) from public.reels r where r.id = p_reel);
end;
$$;
