-- NOOB — media storage (photos, videos, audio) + a guard against images stored inside the database.
--
-- Files live in one PUBLIC bucket called "media", keyed exactly like the old B2 bucket
-- ("posts/123-abc.jpg", "avatars/..."), so every stored key keeps working unchanged. Anyone can VIEW a
-- file if they know its (unguessable) address; only signed-in people can ADD files, and only into the
-- known folders; you can remove only your own files (admins can remove any, for moderation).
-- Nobody can list the bucket's contents (there is deliberately no SELECT policy on the objects table).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/*', 'video/*', 'audio/*'])
on conflict (id) do update
  set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/*', 'video/*', 'audio/*'];

create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products')
  );

-- Deleting a row in Postgres also requires being allowed to SEE it, so people can see (and list) ONLY
-- their own files here. Viewing a file through its public address needs no policy at all.
create policy media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'media' and (owner_id = (select auth.uid())::text or public.is_admin()));

create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner_id = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------------------------------------------------
-- A photo must never be stored INSIDE the database as a base64 "data:" string. One 3 MB profile
-- photo stored that way once rode along in every save and every chat/user payload and multiplied
-- into gigabytes of traffic. Anything that large has to be uploaded as a real file instead.
-- ---------------------------------------------------------------------------------------------
create or replace function public.guard_inline_media() returns trigger
language plpgsql set search_path = public as $$
declare v text;
begin
  -- (read the field by name: a plain "new.media_url" would not even compile for the tables that lack it)
  v := to_jsonb(new) ->> (case tg_table_name when 'post_slides' then 'media_url' else 'avatar' end);
  if v is not null and v like 'data:%' and length(v) > 30000 then
    raise exception 'That picture is too large to save directly. Please upload it as a file instead.' using errcode = '22001';
  end if;
  return new;
end;
$$;

create trigger profiles_no_inline_media before insert or update of avatar on public.profiles
  for each row execute function public.guard_inline_media();
create trigger post_slides_no_inline_media before insert or update of media_url on public.post_slides
  for each row execute function public.guard_inline_media();
create trigger chats_no_inline_media before insert or update of avatar on public.chats
  for each row execute function public.guard_inline_media();

revoke execute on function public.guard_inline_media() from authenticated;
