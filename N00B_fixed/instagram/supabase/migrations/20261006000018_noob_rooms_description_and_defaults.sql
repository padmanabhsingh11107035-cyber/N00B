-- NOOB Rooms polish: a description field (shown on the richer, bigger lobby cards and collected on
-- the create-room form alongside category), and four always-on default rooms so the lobby is never
-- empty — host_id stays null exactly like the future activity rooms, so leave_noob_room's
-- empty-room auto-end never touches them.

alter table public.noob_rooms add column if not exists description text not null default '';

create or replace function public.list_noob_rooms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'category', r.category, 'description', r.description, 'activityType', r.activity_type, 'createdAt', r.created_at,
    'participantCount', (select count(*) from public.noob_room_participants p where p.room_id = r.id),
    'host', case when r.host_id is null then null else
      (select jsonb_build_object('id', h.id, 'username', h.username, 'avatar', h.avatar) from public.profiles h where h.id = r.host_id)
    end
  ) order by (r.activity_type is null), (select count(*) from public.noob_room_participants p where p.room_id = r.id) desc, r.created_at desc), '[]'::jsonb)
  from public.noob_rooms r
  where r.status = 'live';
$$;
grant execute on function public.list_noob_rooms() to authenticated;

create or replace function public.start_noob_room(p_name text, p_category text default 'General', p_description text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; r public.noob_rooms;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  nm := left(btrim(coalesce(p_name, '')), 60);
  if nm = '' then raise exception 'Give your room a name.'; end if;
  insert into public.noob_rooms (host_id, name, category, description, channel_name)
  values (me, nm, left(btrim(coalesce(p_category, 'General')), 30), left(btrim(coalesce(p_description, '')), 200), 'noobroom_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into r;
  return jsonb_build_object('success', true, 'roomId', r.id, 'name', r.name);
end;
$$;
grant execute on function public.start_noob_room(text, text, text) to authenticated;

insert into public.noob_rooms (name, category, description, channel_name, status)
values
  ('Late Night Vibes', 'Vibe', 'Chill late-night hangout — music talk, random chat, no pressure.', 'noobroom_late_night_vibes', 'live'),
  ('BGMI Squad', 'Gaming', 'Find squadmates, talk strategy, flex your kills.', 'noobroom_bgmi_squad', 'live'),
  ('Exam Survivors', 'Study', 'Stressed about exams? Vent, study together, survive together.', 'noobroom_exam_survivors', 'live'),
  ('India Gen-Z', 'Vibe', 'Desi Gen-Z hangout — memes, slang, chaos.', 'noobroom_india_genz', 'live')
on conflict (channel_name) do nothing;
