-- Sign-up IP address + platform "Not recorded" for new accounts: the old stamp was a silent fire-and-forget call to the edge function that could fail without anybody knowing.
-- This is a database-side copy: the app calls it right after sign-up AND on every login until both values exist. It only fills values that are still empty (never overwrites), reads the address and
-- device from this request's own headers (the client cannot lie about them), and never raises.
create or replace function public.note_signup_device() returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_plat text;
begin
  if v_me is null then return; end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ip := left(nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), ''), 64);
  v_ua := coalesce(v_h->>'user-agent', '');
  v_plat := case when v_ua ~* 'Android' then 'Android' when v_ua ~* 'iPhone|iPad|iPod' then 'iPhone/iPad' when v_ua ~* 'Windows' then 'Windows'
                 when v_ua ~* 'Mac OS X' then 'Mac' when v_ua ~* 'Linux' then 'Linux' when v_ua = '' then null else 'Other' end;
  update public.profile_private
     set ip_address = coalesce(nullif(ip_address, ''), v_ip),
         signup_platform = coalesce(nullif(signup_platform, ''), v_plat)
   where user_id = v_me and (coalesce(ip_address, '') = '' or coalesce(signup_platform, '') = '');
exception when others then null;
end;
$$;
revoke execute on function public.note_signup_device() from public, anon;
grant execute on function public.note_signup_device() to authenticated;
