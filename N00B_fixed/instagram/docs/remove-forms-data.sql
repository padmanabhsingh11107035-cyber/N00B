-- NOOB Forms: remove EVERYTHING that belongs to it from the database (the forms, the answers, the helpers, the web hooks, the timer).
-- THIS CANNOT BE UNDONE. Take a backup first (Supabase > Database > Backups, or the weekly backup file). Safe to run twice.
-- After it: delete the storage bucket "form-uploads" (Storage > form-uploads > the three dots > Delete bucket; the files of a bucket can only be removed from the dashboard or the Storage API,
-- not by SQL) and the two functions "forms-ai" and "forms-webhook-run" (Edge Functions > each one > Delete).

-- 1. the timer that sent web hooks (only when the cron extension is there)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'noob-forms-webhooks';
  end if;
exception when others then
  raise notice 'The forms timer was not removed: %', sqlerrm;
end $$;

-- 2. the rules for the form files (on the storage table)
drop policy if exists form_uploads_insert on storage.objects;
drop policy if exists form_uploads_select on storage.objects;
drop policy if exists form_uploads_delete on storage.objects;

-- 3. the tables, with their answers, helpers lists, web hooks and the triggers on them
drop table if exists public.form_webhook_deliveries cascade;
drop table if exists public.form_webhooks cascade;
drop table if exists public.form_collaborators cascade;
drop table if exists public.form_responses cascade;
drop table if exists public.forms cascade;

-- 4. the functions (only these exact names)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'forms_count_responses', 'forms_touch', 'forms_guard', 'forms_notify',
      'form_q_visible', 'form_q_correct', 'form_public_get', 'form_public_submit', 'form_publish', 'form_role',
      'form_collab_add', 'form_collab_remove', 'form_collab_list',
      'form_upload_ok', 'form_can_read_files', 'form_can_delete_files', 'form_uploads_orphans')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;
