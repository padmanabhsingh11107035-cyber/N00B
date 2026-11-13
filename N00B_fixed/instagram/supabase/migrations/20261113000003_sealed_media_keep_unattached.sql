-- NOOB - locked chat attachments: a delivered file is never purged because its follow-up "attach" call failed (security retest N1), and the
-- storage rule for the locked-file type ignores upper/lower case (N3).
--
-- N1: register_sealed_media used to delete the owner's registrations that were still unattached after two days, and their files went to the 24 h trash.
--     If the message WAS delivered but attach_sealed_media never succeeded (offline, app closed), the receiver then saw "no longer available".
--     Now nothing is deleted there any more. A forgotten registration is a tiny row; only discard_sealed_media (the send itself failed) removes one.
-- N3: the restrictive storage policy compares the type with lower(), so "Application/Octet-Stream" can not slip past it.
-- Run once, in the SQL editor. Safe to run twice. Needs migration 20261113000002.

create or replace function public.register_sealed_media(p_chat uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$' then raise exception 'That is not a valid attachment.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = p_key and o.owner_id = me::text) then
    raise exception 'That upload was not found.';
  end if;
  insert into public.sealed_media (key, owner_id, chat_id) values (p_key, me, p_chat) on conflict (key) do nothing;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.register_sealed_media(uuid, text) from public, anon;
grant execute on function public.register_sealed_media(uuid, text) to authenticated;

drop policy if exists media_sealed_only on storage.objects;
create policy media_sealed_only on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'media'
    or lower(coalesce(metadata ->> 'mimetype', '')) <> 'application/octet-stream'
    or name ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$'
  );
