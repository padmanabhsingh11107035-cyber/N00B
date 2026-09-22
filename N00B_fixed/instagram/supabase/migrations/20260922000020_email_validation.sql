-- NOOB — signing up now requires a real-looking email address (name@domain.tld), not just any non-empty text. Everything else about
-- check_signup is unchanged from before — existing accounts (whatever email they were made with) are completely untouched.
create or replace function public.check_signup(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  clean text;
  dob date;
  age numeric;
  em text := lower(btrim(coalesce(p->>'email', '')));
  mob text := btrim(coalesce(p->>'mobileNumber', ''));
begin
  if btrim(coalesce(p->>'firstName', '')) = '' then return jsonb_build_object('error', 'Please enter your name'); end if;
  if em = '' then return jsonb_build_object('error', 'Email address is required'); end if;
  if em !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' or length(em) > 254 then
    return jsonb_build_object('error', 'Please enter a valid email address');
  end if;
  if btrim(coalesce(p->>'username', '')) = '' then return jsonb_build_object('error', 'User ID / Username is required'); end if;
  if coalesce(p->>'password', '') = '' then return jsonb_build_object('error', 'Password is required'); end if;
  if btrim(coalesce(p->>'bio', '')) = '' then return jsonb_build_object('error', 'Bio is compulsory. Please write a short bio about yourself.'); end if;
  if mob = '' then return jsonb_build_object('error', 'Mobile number is required'); end if;
  if coalesce((p->>'agreedToTerms')::boolean, false) is not true then
    return jsonb_build_object('error', 'You must agree to NOOB''s general terms and privacy policy');
  end if;

  if coalesce(p->>'dateOfBirth', '') = '' then return jsonb_build_object('error', 'Date of birth is required'); end if;
  begin
    dob := (p->>'dateOfBirth')::date;
  exception when others then
    return jsonb_build_object('error', 'Please enter a valid date of birth');
  end;
  if dob > current_date then return jsonb_build_object('error', 'Please enter a valid date of birth'); end if;
  age := (current_date - dob) / 365.25;
  if age < 13 then return jsonb_build_object('error', 'You must be at least 13 years old to create a NOOB account'); end if;
  if age > 82 then return jsonb_build_object('error', 'NOOB accounts are only available to users 82 years old or younger'); end if;

  clean := regexp_replace(lower(btrim(p->>'username')), '[^a-z0-9_.]', '', 'g');
  if clean = '' then return jsonb_build_object('error', 'User ID contains invalid characters'); end if;
  if exists (select 1 from public.profiles where lower(username) = clean) then
    return jsonb_build_object('error', 'User ID is already taken. Please choose another.');
  end if;

  -- a suspended person can't just sign up again under a new name
  if exists (
    select 1 from public.profiles pr join public.profile_private pp on pp.user_id = pr.id
    where pr.is_suspended and (lower(pp.email) = em or (mob <> '' and pp.mobile_number = mob))
  ) then
    return jsonb_build_object(
      'error', 'This account is suspended.', 'suspended', true,
      'message', 'We have detected that your account is suspended, and attempting to create a new account could result in further action against you. Please wait — our team will contact you.'
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.check_signup(jsonb) to anon, authenticated;
