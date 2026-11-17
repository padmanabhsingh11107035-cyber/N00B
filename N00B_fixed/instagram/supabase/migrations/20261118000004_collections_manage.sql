-- Saved collections you can really use: create, fill, open, rename, delete (the first two existed; the screen only faked them).
-- Only the owner of a collection can change it; adding a post needs the post to exist; a collection holds at most 100 posts and a person has at most 30 collections.
-- Safe to run more than once.

create or replace function public.create_collection(p_name text default null, p_cover_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select count(*) from public.collections where user_id = me) >= 30 then raise exception 'You can have up to 30 collections.'; end if;
  insert into public.collections (user_id, name, cover_url)
  values (me, left(coalesce(nullif(btrim(p_name), ''), 'New Collection'), 40), coalesce(p_cover_url, '')) returning id into cid;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = cid));
end;
$$;
revoke execute on function public.create_collection(text, text) from public, anon;
grant execute on function public.create_collection(text, text) to authenticated;

create or replace function public.add_post_to_collection(p_collection uuid, p_post uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.collections where id = p_collection and user_id = me) then raise exception 'Collection not found.'; end if;
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'This post is no longer available.'; end if;
  if (select count(*) from public.collection_posts where collection_id = p_collection) >= 100
     and not exists (select 1 from public.collection_posts where collection_id = p_collection and post_id = p_post) then
    raise exception 'A collection holds up to 100 posts.';
  end if;
  insert into public.collection_posts (collection_id, post_id) values (p_collection, p_post) on conflict do nothing;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = p_collection));
end;
$$;
revoke execute on function public.add_post_to_collection(uuid, uuid) from public, anon;
grant execute on function public.add_post_to_collection(uuid, uuid) to authenticated;

create or replace function public.remove_post_from_collection(p_collection uuid, p_post uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.collections where id = p_collection and user_id = me) then raise exception 'Collection not found.'; end if;
  delete from public.collection_posts where collection_id = p_collection and post_id = p_post;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = p_collection));
end;
$$;
revoke execute on function public.remove_post_from_collection(uuid, uuid) from public, anon;
grant execute on function public.remove_post_from_collection(uuid, uuid) to authenticated;

create or replace function public.rename_collection(p_collection uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text := left(btrim(coalesce(p_name, '')), 40);
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if nm = '' then raise exception 'Give the collection a name.'; end if;
  update public.collections set name = nm where id = p_collection and user_id = me;
  if not found then raise exception 'Collection not found.'; end if;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = p_collection));
end;
$$;
revoke execute on function public.rename_collection(uuid, text) from public, anon;
grant execute on function public.rename_collection(uuid, text) to authenticated;

create or replace function public.delete_collection(p_collection uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.collections where id = p_collection and user_id = me;
  if not found then raise exception 'Collection not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.delete_collection(uuid) from public, anon;
grant execute on function public.delete_collection(uuid) to authenticated;
