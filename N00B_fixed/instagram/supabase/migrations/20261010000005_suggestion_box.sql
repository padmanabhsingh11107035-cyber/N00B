-- NOOB Suggestion Box: members send a suggestion, an improvement idea or an issue from the home menu; the NOOB administrator
-- reads them in a separate "Suggestions" tab of the admin panel, replies (the member gets a notification) and marks them solved.
-- This is separate from the NOOB AI feedback (that one is sent from inside NOOB AI).
--
-- Additive only: one new table and six new functions. No existing table or row is touched.

create table if not exists public.app_suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category    text not null check (category in ('suggestion', 'improvement', 'issue')),
  message     text not null,
  status      text not null default 'open' check (status in ('open', 'replied', 'closed')),
  admin_reply text,
  replied_by  uuid references public.profiles(id) on delete set null,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists app_suggestions_user_idx on public.app_suggestions (user_id, created_at desc);
create index if not exists app_suggestions_status_idx on public.app_suggestions (status, created_at desc);

-- All access goes through the functions below (they check who is asking). Nobody can read or write the table directly.
alter table public.app_suggestions enable row level security;
revoke all on public.app_suggestions from anon, authenticated;

-- A member sends one. At most 10 a day each, so the box can not be flooded.
create or replace function public.submit_app_suggestion(p_category text, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); body text := btrim(coalesce(p_message, '')); sid uuid;
begin
  if me is null then raise exception 'Please log in first.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and not is_suspended) then
    raise exception 'This account can not send suggestions.' using errcode = '42501';
  end if;
  if p_category not in ('suggestion', 'improvement', 'issue') then raise exception 'Choose what you are sending.'; end if;
  if length(body) < 5 or length(body) > 2000 then raise exception 'Please write between 5 and 2000 characters.'; end if;
  if (select count(*) from public.app_suggestions where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent a lot today. Please try again tomorrow.';
  end if;
  insert into public.app_suggestions (user_id, category, message) values (me, p_category, body) returning id into sid;
  return jsonb_build_object('success', true, 'id', sid);
end;
$$;
revoke execute on function public.submit_app_suggestion(text, text) from public, anon;
grant execute on function public.submit_app_suggestion(text, text) to authenticated;

-- A member's own earlier messages, newest first, with any reply.
create or replace function public.my_app_suggestions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'category', s.category, 'message', s.message, 'status', s.status,
      'adminReply', s.admin_reply, 'repliedAt', s.replied_at, 'createdAt', s.created_at
    ) order by s.created_at desc)
    from (select * from public.app_suggestions where user_id = me order by created_at desc limit 50) s
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.my_app_suggestions() from public, anon;
grant execute on function public.my_app_suggestions() to authenticated;

-- Administrator: every message, newest first.
create or replace function public.admin_app_suggestions_list(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can view the suggestion box.');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'userId', s.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
      'category', s.category, 'message', s.message, 'status', s.status, 'adminReply', s.admin_reply,
      'repliedAt', s.replied_at, 'createdAt', s.created_at
    ) order by s.created_at desc)
    from public.app_suggestions s join public.profiles p on p.id = s.user_id
    where p_status is null or s.status = p_status
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_app_suggestions_list(text) from public, anon;
grant execute on function public.admin_app_suggestions_list(text) to authenticated;

-- Administrator: reply. The member gets a notification with the reply.
create or replace function public.admin_reply_app_suggestion(p_id uuid, p_reply text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; body text := btrim(coalesce(p_reply, '')); s public.app_suggestions;
begin
  me := public.require_master_admin('Only the NOOB administrator can reply in the suggestion box.');
  if body = '' or length(body) > 2000 then raise exception 'Enter a reply up to 2000 characters.'; end if;
  update public.app_suggestions set status = 'replied', admin_reply = body, replied_by = me, replied_at = now()
  where id = p_id
  returning * into s;
  if not found then raise exception 'That message was not found.'; end if;
  perform public.notify_user(s.user_id, 'suggestion_reply', me, left(body, 200), 'NOOB replied to your suggestion');
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_reply_app_suggestion(uuid, text) from public, anon;
grant execute on function public.admin_reply_app_suggestion(uuid, text) to authenticated;

-- Administrator: mark solved.
create or replace function public.admin_close_app_suggestion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can close suggestions.');
  update public.app_suggestions set status = 'closed' where id = p_id;
  if not found then raise exception 'That message was not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_close_app_suggestion(uuid) from public, anon;
grant execute on function public.admin_close_app_suggestion(uuid) to authenticated;

-- Administrator: delete one (spam or test messages).
create or replace function public.admin_delete_app_suggestion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can delete suggestions.');
  delete from public.app_suggestions where id = p_id;
  if not found then raise exception 'That message was not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_delete_app_suggestion(uuid) from public, anon;
grant execute on function public.admin_delete_app_suggestion(uuid) to authenticated;
