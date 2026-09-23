-- NOOB — allow renaming ANY highlight you own, including one made automatically from your
-- stories. This reverses the earlier "an automatic highlight keeps its automatic name" rule now
-- that the person has explicitly asked to be able to rename those too.
create or replace function public.rename_highlight(p_highlight uuid, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h public.highlights; new_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  select * into h from public.highlights where id = p_highlight;
  if h.id is null then raise exception 'Highlight not found.'; end if;
  if h.user_id <> me then raise exception 'You can only edit your own highlights.' using errcode = '42501'; end if;
  if new_title is null then raise exception 'A highlight needs a name.'; end if;
  update public.highlights set title = new_title where id = p_highlight;
  return jsonb_build_object('success', true);
end;
$$;
