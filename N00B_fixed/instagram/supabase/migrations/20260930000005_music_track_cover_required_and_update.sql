-- NOOB — a music track's cover is now required at upload (the frontend already enforced this;
-- this closes the same gap server-side instead of silently falling back to a placeholder image
-- for anyone calling the RPC directly), and the uploader can change it later. Changing it hands
-- back the PREVIOUS cover_url so the frontend can permanently delete that old file from storage
-- right after saving the new one — Postgres can't delete a physical storage object itself (see
-- migration 20260930000004's note), so this RPC's job is just: verify ownership, swap the row,
-- return what the old file was.

create or replace function public.upload_music_track(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; tid uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if btrim(coalesce(p->>'title', '')) = '' or coalesce(p->>'audioUrl', '') = '' then
    raise exception 'Track title and audio file are required';
  end if;
  if coalesce(p->>'coverUrl', '') = '' then
    raise exception 'A cover image is required.';
  end if;
  insert into public.music_tracks (uploader_id, title, artist, genre, audio_url, cover_url, duration)
  values (me, btrim(p->>'title'), btrim(coalesce(nullif(p->>'artist', ''), nullif(prof.display_name, ''), prof.username)),
          coalesce(nullif(p->>'genre', ''), 'Original / All Genres'), p->>'audioUrl', p->>'coverUrl',
          coalesce(nullif(p->>'duration', ''), '3:00'))
  returning id into tid;
  return jsonb_build_object('success', true, 'track', (select public.music_json(t) from public.music_tracks t where t.id = tid));
end;
$$;

create or replace function public.update_music_track_cover(p_track uuid, p_cover_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; old_cover text; new_cover text := btrim(coalesce(p_cover_url, ''));
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select uploader_id, cover_url into owner, old_cover from public.music_tracks where id = p_track;
  if owner is null then raise exception 'Track not found'; end if;
  if owner <> me then raise exception 'Only the publisher who uploaded this track can change its cover.' using errcode = '42501'; end if;
  if new_cover = '' then raise exception 'Choose a cover image.'; end if;
  update public.music_tracks set cover_url = new_cover where id = p_track;
  return jsonb_build_object('success', true, 'track', (select public.music_json(x) from public.music_tracks x where x.id = p_track), 'oldCoverUrl', old_cover);
end;
$$;

revoke execute on function public.update_music_track_cover(uuid, text) from public, anon;
grant execute on function public.update_music_track_cover(uuid, text) to authenticated;
