-- NOOB STUDY, part 6: past papers. Lets the server read the start of several of ONE student's own finished documents (the question papers they added),
-- so it can find topics that come up again and again in THOSE papers. Only the server may call it, and only for the student it is asking about.
-- Safe to run more than once.

create or replace function public.study_svc_papers(p_user uuid, p_ids uuid[], p_per integer default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; m record; n integer := 0; rows jsonb; per integer := greatest(1, least(coalesce(p_per, 14), 30));
begin
  if p_ids is null then return out; end if;
  for m in select id, title, kind, chunk_count from public.study_materials where user_id = p_user and status = 'ready' and id = any (p_ids)
           order by array_position(p_ids, id) limit 8 loop
    n := n + 1;
    select coalesce(jsonb_agg(jsonb_build_object('page', c.page, 'text', c.text) order by c.idx), '[]'::jsonb) into rows
      from (select page, text, idx from public.study_chunks where material_id = m.id order by idx limit per) c;
    out := out || jsonb_build_array(jsonb_build_object('n', n, 'id', m.id, 'title', m.title, 'kind', m.kind, 'chunks', rows, 'more', m.chunk_count > per));
  end loop;
  return out;
end;
$$;

-- who may call what
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'study\_svc\_%' then execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end;
$$;
