-- Switching from a live profile picture back to a normal photo: the photo was replaced, but the "this is a live picture" mark and its video
-- stayed on the account, so posts, comments, stories and reels kept showing the live picture while the profile page showed the new photo.
-- Now, whenever a different profile photo is saved, the live mark and its video are removed with it. (A photo that is saved unchanged,
-- for example when only the bio is edited, leaves a live picture alone. Applying a live picture itself goes through apply_live_avatar.)

create or replace function public.update_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur public.profiles;
  clean text;
  dob date;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into cur from public.profiles where id = me;
  if not found then raise exception 'User not found'; end if;

  if p ? 'username' and lower(btrim(p->>'username')) <> lower(cur.username) then
    clean := regexp_replace(lower(btrim(p->>'username')), '[^a-z0-9_.]', '', 'g');
    if clean = '' then raise exception 'User ID contains invalid characters'; end if;
    if exists (select 1 from public.profiles where id <> me and lower(username) = clean) then
      raise exception 'Username is already taken by another account.' using errcode = '23505';
    end if;
    update public.profiles set username = clean where id = me;
  end if;

  if p ? 'dateOfBirth' and nullif(p->>'dateOfBirth', '') is not null then
    begin dob := (p->>'dateOfBirth')::date; exception when others then raise exception 'Please enter a valid date of birth.'; end;
    if dob > current_date then raise exception 'Please enter a valid date of birth.'; end if;
    if (current_date - dob) / 365.25 < 13 then raise exception 'You must be at least 13 years old to use NOOB.'; end if;
    if (current_date - dob) / 365.25 > 82 then raise exception 'NOOB accounts are only available to users 82 years old or younger.'; end if;
    update public.profile_private set date_of_birth = dob where user_id = me;
  end if;

  if p ? 'email' and nullif(btrim(p->>'email'), '') is not null then
    if lower(btrim(p->>'email')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Please enter a valid email address.'; end if;
    update public.profile_private set email = lower(btrim(p->>'email')) where user_id = me;
  end if;

  update public.profiles set
    display_name      = coalesce(nullif(btrim(p->>'displayName'), ''), display_name),
    avatar            = coalesce(nullif(p->>'avatar', ''), avatar),
    bio               = case when p ? 'bio' then btrim(coalesce(p->>'bio', '')) else bio end,
    website           = case when p ? 'website' then btrim(coalesce(p->>'website', '')) else website end,
    city              = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else city end,
    pronouns          = case when p ? 'pronouns' then p->>'pronouns' else pronouns end,
    account_type      = case when p->>'accountType' in ('public', 'private', 'business') then p->>'accountType' else account_type end,
    is_business       = case when p->>'accountType' in ('public', 'private', 'business') then p->>'accountType' = 'business'
                             when p ? 'isBusiness' then (p->>'isBusiness')::boolean else is_business end,
    business_category = case when p ? 'businessCategory' then p->>'businessCategory' else business_category end,
    interests         = case when jsonb_typeof(p->'interests') = 'array' then array(select jsonb_array_elements_text(p->'interests')) else interests end,
    social_links      = case when jsonb_typeof(p->'socialLinks') = 'object' then p->'socialLinks' else social_links end,
    external_links    = case when jsonb_typeof(p->'externalLinks') = 'array' then p->'externalLinks' else external_links end,
    custom_links      = case when jsonb_typeof(p->'customLinks') = 'array' then p->'customLinks' else custom_links end,
    cross_profiles    = case when jsonb_typeof(p->'crossProfiles') = 'array' then p->'crossProfiles' else cross_profiles end,
    privacy_settings  = case when jsonb_typeof(p->'privacySettings') = 'object' then p->'privacySettings' else privacy_settings end,
    status_note       = case when p ? 'statusNote' then nullif(p->'statusNote', 'null'::jsonb) else status_note end
  where id = me;

  -- a different photo than before: it is a normal photo now, not the live one
  if nullif(p->>'avatar', '') is not null and (p->>'avatar') is distinct from cur.avatar and (cur.is_live_avatar or cur.live_avatar_video_url is not null) then
    update public.profiles set is_live_avatar = false, live_avatar_video_url = null where id = me;
  end if;

  update public.profile_private set
    first_name       = coalesce(nullif(btrim(p->>'firstName'), ''), first_name),
    last_name        = coalesce(nullif(btrim(p->>'lastName'), ''), last_name),
    country_code     = coalesce(nullif(p->>'countryCode', ''), country_code),
    mobile_number    = case when p ? 'mobileNumber' then btrim(coalesce(p->>'mobileNumber', '')) else mobile_number end,
    gender           = case when p ? 'gender' then p->>'gender' else gender end,
    business_email   = case when p ? 'businessEmail' then p->>'businessEmail' else business_email end,
    business_phone   = case when p ? 'businessPhone' then p->>'businessPhone' else business_phone end,
    business_address = case when p ? 'businessAddress' then p->>'businessAddress' else business_address end,
    business_addresses = case when jsonb_typeof(p->'businessAddresses') = 'array' then array(select jsonb_array_elements_text(p->'businessAddresses')) else business_addresses end
  where user_id = me;

  return public.get_my_user();
end;
$$;
