-- NOOB AI feedback: report an issue or suggest a change from inside NOOB AI. Saved here so it shows
-- up in the NOOB admin panel, the admin can reply from there, and the person gets a real notification
-- when they do. NOOB AI's server never holds a login session for the linked NOOB account (the whole
-- point of "Continue with NOOB" is that the password is never kept), so it proves who it's speaking
-- for with a shared secret instead — same shape as the existing push_secret in internal_config.

create table public.noob_ai_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  category     text not null check (category in ('issue', 'suggestion')),
  message      text not null,
  status       text not null default 'open' check (status in ('open', 'replied', 'closed')),
  admin_reply  text,
  replied_by   uuid references public.profiles(id) on delete set null,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index noob_ai_feedback_user_idx on public.noob_ai_feedback (user_id, created_at desc);
create index noob_ai_feedback_status_idx on public.noob_ai_feedback (status, created_at desc);
alter table public.noob_ai_feedback enable row level security;
create policy noob_ai_feedback_read_own on public.noob_ai_feedback for select using (user_id = auth.uid());

insert into public.internal_config (key, value)
values ('noob_ai_feedback_secret', 'a40b659d969249189021ac1ca6c9c99a3e071a2fad654cd4aac5133b1ebdcc02')
on conflict (key) do nothing;

create or replace function public.submit_noob_ai_feedback(p_secret text, p_noob_user_id uuid, p_category text, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; body text := btrim(coalesce(p_message, '')); fid uuid;
begin
  select value into expected from public.internal_config where key = 'noob_ai_feedback_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  if p_category not in ('issue', 'suggestion') then raise exception 'Invalid category.'; end if;
  if body = '' or length(body) > 2000 then raise exception 'Enter a message up to 2000 characters.'; end if;
  if not exists (select 1 from public.profiles where id = p_noob_user_id) then raise exception 'Unknown NOOB account.'; end if;
  insert into public.noob_ai_feedback (user_id, category, message) values (p_noob_user_id, p_category, body) returning id into fid;
  return jsonb_build_object('success', true, 'id', fid);
end;
$$;
revoke execute on function public.submit_noob_ai_feedback(text, uuid, text, text) from public;
grant execute on function public.submit_noob_ai_feedback(text, uuid, text, text) to anon, authenticated;

-- So NOOB AI can show someone their own submissions and any reply (same secret proves who's asking;
-- scoped to exactly the one account passed in, never a full list).
create or replace function public.noob_ai_feedback_for_user(p_secret text, p_noob_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'noob_ai_feedback_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'category', f.category, 'message', f.message, 'status', f.status,
      'adminReply', f.admin_reply, 'repliedAt', f.replied_at, 'createdAt', f.created_at
    ) order by f.created_at desc)
    from public.noob_ai_feedback f where f.user_id = p_noob_user_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.noob_ai_feedback_for_user(text, uuid) from public;
grant execute on function public.noob_ai_feedback_for_user(text, uuid) to anon, authenticated;

create or replace function public.admin_noob_ai_feedback_list(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can view NOOB AI feedback.');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'userId', f.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
      'category', f.category, 'message', f.message, 'status', f.status, 'adminReply', f.admin_reply,
      'repliedAt', f.replied_at, 'createdAt', f.created_at
    ) order by f.created_at desc)
    from public.noob_ai_feedback f join public.profiles p on p.id = f.user_id
    where p_status is null or f.status = p_status
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_noob_ai_feedback_list(text) from public, anon;
grant execute on function public.admin_noob_ai_feedback_list(text) to authenticated;

create or replace function public.admin_reply_noob_ai_feedback(p_feedback_id uuid, p_reply text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; body text := btrim(coalesce(p_reply, '')); f public.noob_ai_feedback;
begin
  me := public.require_master_admin('Only the NOOB administrator can reply to NOOB AI feedback.');
  if body = '' or length(body) > 2000 then raise exception 'Enter a reply up to 2000 characters.'; end if;
  update public.noob_ai_feedback set status = 'replied', admin_reply = body, replied_by = me, replied_at = now()
  where id = p_feedback_id
  returning * into f;
  if not found then raise exception 'Feedback not found.'; end if;
  perform public.notify_user(f.user_id, 'ai_feedback_reply', me, left(body, 200), 'NOOB replied to your NOOB AI feedback');
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_reply_noob_ai_feedback(uuid, text) from public, anon;
grant execute on function public.admin_reply_noob_ai_feedback(uuid, text) to authenticated;

create or replace function public.admin_close_noob_ai_feedback(p_feedback_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can close NOOB AI feedback.');
  update public.noob_ai_feedback set status = 'closed' where id = p_feedback_id;
  if not found then raise exception 'Feedback not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_close_noob_ai_feedback(uuid) from public, anon;
grant execute on function public.admin_close_noob_ai_feedback(uuid) to authenticated;
