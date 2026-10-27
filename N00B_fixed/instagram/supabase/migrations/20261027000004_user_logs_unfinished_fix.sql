-- NOOB — User logs: "Never finished" no longer lists people who have an account.
--
-- Signing in with Google makes an empty login first; a person who already has a NOOB account with the same email then goes on into that account, and the empty login stayed
-- on the list as "Signed in with google but did not finish creating the profile, so there is no account yet". Now a login whose email is on an existing account is not listed.
-- The list is worked out every time it is opened, so the old entries are corrected too (nothing is stored, nothing is deleted).

create or replace function public.admin_user_logs(p_limit integer default 100, p_offset integer default 0, p_search text default null, p_kind text default 'all') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500); v_off integer := greatest(coalesce(p_offset, 0), 0);
        v_kind text := case when p_kind in ('joined', 'deleted', 'unfinished') then p_kind else 'all' end; v_events jsonb; v_total bigint; v_summary jsonb;
begin
  perform public.require_master_admin();
  with ev as (
    select 'joined'::text as kind, p.created_at as at, p.id as user_id, p.username, p.display_name, p.avatar, pp.email as email, pp.signup_platform as detail,
           null::text as how, null::text as by_name, p.created_at as joined_at
      from public.profiles p left join public.profile_private pp on pp.user_id = p.id
    union all
    select 'deleted', d.deleted_at, d.user_id, d.username, d.display_name, null, d.email_hint, null, d.how, d.deleted_by_username, d.signed_up_at
      from public.account_deletions d
    union all
    select 'unfinished', u.created_at, u.id, null, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), null, u.email,
           coalesce(u.raw_app_meta_data->>'provider', ''), null, null, u.created_at
      from auth.users u where not exists (select 1 from public.profiles pr where pr.id = u.id)
        -- a person who signed in with Google and then went on into the account they ALREADY have (same email) did not leave anything unfinished
        and not exists (select 1 from public.profile_private pp2 where lower(pp2.email) = lower(u.email))
  ), f as (
    select * from ev e where (v_kind = 'all' or e.kind = v_kind) and (v_q is null or concat_ws(' ', e.username, e.display_name, e.email) ilike '%' || v_q || '%')
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'at', x.at, 'userId', x.user_id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar,
        'email', x.email, 'detail', x.detail, 'how', x.how, 'by', x.by_name, 'joinedAt', x.joined_at) order by x.at desc), '[]'::jsonb)
       from (select * from f order by f.at desc limit v_lim offset v_off) x),
    (select count(*) from f),
    jsonb_build_object(
      'joined', (select count(*) from ev where ev.kind = 'joined'),
      'joinedLast7Days', (select count(*) from ev where ev.kind = 'joined' and ev.at > now() - interval '7 days'),
      'deleted', (select count(*) from ev where ev.kind = 'deleted'),
      'deletedBySelf', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'self'),
      'deletedByAdmin', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'admin'),
      'deletedBySystem', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'system'),
      'unfinished', (select count(*) from ev where ev.kind = 'unfinished'))
  into v_events, v_total, v_summary;
  return jsonb_build_object('events', v_events, 'total', v_total, 'summary', v_summary);
end;
$$;
revoke execute on function public.admin_user_logs(integer, integer, text, text) from public, anon;
grant execute on function public.admin_user_logs(integer, integer, text, text) to authenticated;
