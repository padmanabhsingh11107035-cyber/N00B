-- NOOB — lets an admin permanently delete any music track: the database row AND the actual
-- audio/cover files in storage, not just an orphaned row. Nothing else in this app currently
-- cleans up storage on delete (posts/reels/stories all leave their files behind today), so this
-- is deliberately narrow: it only ever touches the exact audio_url/cover_url this one track
-- pointed at.
--
-- Gated on is_admin() specifically (not the more permissive can_moderate_content(), which also
-- includes delegated "moderate_content" staff) because the storage bucket's own delete policy
-- (media_delete, migration 20260919000003) only recognizes is_admin() — using the same check
-- here means a delegate can never end up in the half-done state of "row deleted, file stuck"
-- from a storage permission mismatch. The row delete and file delete are two separate steps
-- (Postgres can't itself delete a physical storage object — only Supabase's Storage API can,
-- which the frontend calls right after this returns), so this RPC's job is just: verify admin,
-- delete the row, hand back exactly which storage keys the frontend must now remove.
create or replace function public.delete_music_track(p_track uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.music_tracks;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can permanently delete a track.' using errcode = '42501';
  end if;

  select * into t from public.music_tracks where id = p_track;
  if not found then raise exception 'That track was not found.' using errcode = 'P0002'; end if;

  delete from public.music_tracks where id = p_track;

  return jsonb_build_object('success', true, 'audioUrl', t.audio_url, 'coverUrl', t.cover_url);
end;
$$;

revoke execute on function public.delete_music_track(uuid) from public, anon;
grant execute on function public.delete_music_track(uuid) to authenticated;
