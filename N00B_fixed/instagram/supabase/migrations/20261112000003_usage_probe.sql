-- Read-only usage probe for the daily "Supabase free limit warning" check (.github/workflows/usage-alert.yml).
-- Returns the database size, the total size of all stored files and the row counts of the biggest tables. It changes nothing.
-- Only the service key (service_role) may call it: it is closed to visitors, to logged-in people and to PUBLIC.
create or replace function public.usage_probe()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.metadata ? 'size'), 0),
    'storage_files', (select count(*) from storage.objects),
    'top_tables', coalesce((
      select jsonb_agg(jsonb_build_object('table', t.relname, 'rows', t.n_live_tup, 'bytes', pg_total_relation_size(t.relid)) order by pg_total_relation_size(t.relid) desc)
      from (select relid, relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by pg_total_relation_size(relid) desc limit 12) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.usage_probe() from public;
revoke all on function public.usage_probe() from anon;
revoke all on function public.usage_probe() from authenticated;
grant execute on function public.usage_probe() to service_role;
