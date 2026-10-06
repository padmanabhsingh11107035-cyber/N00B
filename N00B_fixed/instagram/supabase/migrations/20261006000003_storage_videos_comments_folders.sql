-- The storage upload policy only allow-lists specific folder names (see 20260919000003 and its
-- later additions). Two folders already used by the client were never added here, so every upload
-- into them fails with "new row violates row-level security policy":
--   - 'videos'   (new Home/Feed long-video uploads, UploadVideoModal.tsx)
--   - 'comments' (comment photo/video attachments, CommentMediaComposer.tsx — broken since it shipped)
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in
      ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos')
  );
