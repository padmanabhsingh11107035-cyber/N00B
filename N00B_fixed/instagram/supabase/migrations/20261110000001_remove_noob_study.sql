-- NOOB STUDY is removed from the app for good. This file removes its data and its database functions.
--
-- WHAT IT DELETES (this can NOT be undone): every table whose name starts with "study_" in the public schema (students, subjects, plans, notes, flash cards, quizzes, practice,
-- papers, study rooms, settings and so on, with everything in them), every database function whose name starts with "study_" or "admin_study_", and the three storage
-- policies "study_files_*". Nothing else is touched: no profile, post, chat, wallet or other NOOB data refers to these tables (they only point AT profiles, never the other way).
-- It is safe to run more than once.
--
-- BEFORE YOU RUN IT, if you might ever want the study data back: make a backup (Supabase dashboard -> Database -> Backups).

do $$
declare r record;
begin
  -- the functions first (their names carry the argument types, so the list comes from the system catalog)
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'study\_%' escape '\' or p.proname like 'admin\_study\_%' escape '\')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;

  -- then the tables (the foreign keys between them are dropped together with them)
  for r in
    select schemaname, tablename from pg_tables
    where schemaname = 'public' and tablename like 'study\_%' escape '\'
  loop
    execute format('drop table if exists %I.%I cascade', r.schemaname, r.tablename);
  end loop;
end $$;

-- the (unused) storage rules of the study files
drop policy if exists study_files_insert on storage.objects;
drop policy if exists study_files_select on storage.objects;
drop policy if exists study_files_delete on storage.objects;

-- check: this must come back with no rows (nothing of NOOB Study is left)
select 'table' as kind, tablename::text as name from pg_tables where schemaname = 'public' and tablename like 'study\_%' escape '\'
union all
select 'function', proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (proname like 'study\_%' escape '\' or proname like 'admin\_study\_%' escape '\');
