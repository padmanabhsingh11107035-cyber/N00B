-- The original "grant all on all tables in schema public to service_role" (20260919000001) only
-- covered tables that existed at that time. Every table created since needs its own explicit grant
-- (see every migration since) — sparkx_applications never got one, so the dynamic-handler edge
-- function's service-role client got "permission denied" reading it directly (its RPCs, being
-- security definer, were unaffected — only the new direct .from('sparkx_applications') reads used
-- by the email-notification actions hit this).
grant all on public.sparkx_applications to service_role;
