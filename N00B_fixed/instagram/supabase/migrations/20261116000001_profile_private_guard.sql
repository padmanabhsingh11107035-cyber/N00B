-- A person can change their own private details (email, birthday ...), but two fields on that row are written only by the server:
-- the reason for a suspension and the recorded IP address. Found by the logged-in security test of 2026-11-16: a normal account could
-- write "suspended_reason" on its own row. The suspension itself was never changeable this way, only its reason text.
create or replace function public.profile_private_keep_server_fields()
returns trigger
language plpgsql
as $$
begin
  -- a direct change from the app runs as "authenticated"; the server's own functions run as their owner and are let through
  if current_user in ('authenticated', 'anon') then
    new.suspended_reason := old.suspended_reason;
    new.ip_address := old.ip_address;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_private_keep_server_fields on public.profile_private;
create trigger profile_private_keep_server_fields
  before update on public.profile_private
  for each row execute function public.profile_private_keep_server_fields();
