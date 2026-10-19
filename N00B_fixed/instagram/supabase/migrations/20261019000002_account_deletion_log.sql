-- A permanent record of every account that is deleted: who it was, when, and whether the person deleted it themselves, an admin did, or it was done straight in the database.
-- Until now a self-deleted account left no trace (the login, the profile and everything linked to it go together), and Supabase's own sign-in history is not kept for this
-- project, so "who deleted their account?" could not be answered.
--
--   * It is a trigger on the login table itself, so EVERY way an account can go is recorded - the app's "Delete my account", the admin's delete, an approved delete request,
--     and a delete made in the dashboard - and so is whatever is added later.
--   * It records the username, display name, a hidden form of the email (first two letters and the domain: enough to recognise, not enough to contact), when they signed up,
--     when and by whom it was deleted, and how much they had made. No full email, no phone number, no date of birth: a deleted account really is deleted.
--   * It can never stop a deletion: if writing the record fails for any reason, the deletion still goes through.
--   * Two admin deletions that were already in the admin log are copied in.
-- Read it in the SQL editor:  select * from public.account_deletions order by deleted_at desc;     Safe to run more than once.

create table if not exists public.account_deletions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid,
  username            text,
  display_name        text,
  email_hint          text,
  had_profile         boolean not null default false,
  signed_up_at        timestamptz,
  deleted_at          timestamptz not null default now(),
  deleted_by          uuid,
  deleted_by_username text,
  how                 text not null check (how in ('self', 'admin', 'system')),
  posts_count         integer,
  reels_count         integer,
  followers_count     integer
);
create index if not exists account_deletions_deleted_idx on public.account_deletions (deleted_at desc);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;
grant all on public.account_deletions to service_role;

create or replace function public.log_account_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); prof public.profiles; em text; kind text; whoname text;
begin
  begin
    select * into prof from public.profiles where id = old.id;
    select pp.email into em from public.profile_private pp where pp.user_id = old.id;
    em := lower(btrim(coalesce(em, old.email, '')));
    kind := case when who is null then 'system' when who = old.id then 'self' else 'admin' end;
    select username into whoname from public.profiles where id = who;
    insert into public.account_deletions (user_id, username, display_name, email_hint, had_profile, signed_up_at, deleted_by, deleted_by_username, how, posts_count, reels_count, followers_count)
    values (
      old.id, prof.username, prof.display_name,
      case when position('@' in em) > 1 then left(em, 2) || '***@' || split_part(em, '@', 2) else null end,
      prof.id is not null, old.created_at, who, whoname, kind,
      (select count(*)::int from public.posts where user_id = old.id),
      (select count(*)::int from public.reels where user_id = old.id),
      prof.followers_count
    );
  exception when others then
    null;   -- the record is a bonus: it must never be the reason an account cannot be deleted
  end;
  return old;
end;
$$;
revoke execute on function public.log_account_deletion() from public, anon, authenticated;

drop trigger if exists log_account_deletion on auth.users;
create trigger log_account_deletion before delete on auth.users for each row execute function public.log_account_deletion();

-- the deletions an admin made before this existed (the admin log kept the username and the time)
insert into public.account_deletions (user_id, username, deleted_at, deleted_by, deleted_by_username, how)
select l.target_id, l.target_name, l.created_at, l.actor_id, l.actor_name, 'admin'
from public.admin_audit_log l
where l.action = 'account_deleted'
  and not exists (select 1 from public.account_deletions d where d.how = 'admin' and d.username is not distinct from l.target_name and d.deleted_at = l.created_at);
