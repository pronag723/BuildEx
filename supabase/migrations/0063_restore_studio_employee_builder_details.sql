-- Invitation-code registrations use the standard builder detail stages.
-- The studio owns the portfolio, so it remains the only optional stage.

create or replace function public.complete_pending_studio_employee_registration()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code citext;
  v_studio uuid;
  v_membership uuid;
  v_status text;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select pending_employee_code into v_code
    from public.builder_profiles where id = me;
  if v_code is null then raise exception 'No pending studio registration'; end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;

  if not exists (
    select 1 from public.profiles
     where id = me and role in ('builder', 'both')
       and onboarding_completed_at is null
       and username is not null and length(trim(display_name)) >= 2
  ) then raise exception 'Complete your builder identity first'; end if;

  if not exists (
    select 1 from public.builder_profiles
     where id = me
       and coalesce(array_length(tools, 1), 0) > 0
       and coalesce(array_length(specialties, 1), 0) > 0
       and coalesce(array_length(build_types, 1), 0) > 0
       and coalesce(response_time_hours, 0) > 0
       and jsonb_typeof(rates) = 'object' and rates <> '{}'::jsonb
  ) then raise exception 'Complete your builder details before joining the studio'; end if;

  select c.studio_id into v_studio
    from public.studio_employee_codes c join public.studios s on s.id = c.studio_id
   where c.code = v_code and c.status = 'active' and s.status in ('pending', 'active')
     and (c.expires_at is null or c.expires_at > now())
     and c.redemptions_used < c.max_redemptions
   for update of c;
  if v_studio is null then raise exception 'That employee code is invalid, expired, or full'; end if;

  update public.studio_employee_codes set redemptions_used = redemptions_used + 1
   where studio_id = v_studio and code = v_code and redemptions_used < max_redemptions;
  if not found then raise exception 'That employee code is full'; end if;

  select availability_status into v_status from public.builder_profiles where id = me;
  v_status := case when v_status = 'available' then 'available' else 'busy' end;
  update public.builder_profiles
     set profile_type = 'studio_employee', studio_id = v_studio,
         availability_status = v_status, is_available = (v_status <> 'busy'),
         pending_employee_code = null
   where id = me;
  update public.profiles set onboarding_completed_at = now() where id = me;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source)
  values (v_studio, me, v_status,
          case when v_status = 'busy' then 'manual' else null end)
  returning id into v_membership;
  return v_membership;
end;
$$;

-- An independent builder becomes publicly available only after completing the
-- whole independent-builder profile, including a personal portfolio. This
-- matters after a studio removes an employee: their former studio profile must
-- not be advertised as an independent one until it is complete.
create or replace function public.set_my_builder_availability(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('available', 'limited', 'busy') then
    raise exception 'Invalid availability';
  end if;

  if p_status <> 'busy' and not exists (
    select 1
      from public.profiles p
      join public.builder_profiles bp on bp.id = p.id
     where p.id = auth.uid()
       and p.role in ('builder', 'both')
       and p.onboarding_completed_at is not null
       and bp.profile_type = 'independent'
       and coalesce(array_length(bp.tools, 1), 0) > 0
       and coalesce(array_length(bp.specialties, 1), 0) > 0
       and coalesce(array_length(bp.build_types, 1), 0) > 0
       and coalesce(bp.response_time_hours, 0) > 0
       and jsonb_typeof(bp.rates) = 'object' and bp.rates <> '{}'::jsonb
       and exists (select 1 from public.portfolio_images pi where pi.builder_id = p.id)
  ) then
    raise exception 'Finish your independent profile and add a portfolio image before becoming available';
  end if;

  update public.builder_profiles
     set availability_status = p_status, is_available = (p_status <> 'busy')
   where id = auth.uid() and profile_type = 'independent';
  if not found then raise exception 'Independent builder profile not found'; end if;
end;
$$;

revoke all on function public.set_my_builder_availability(text) from public;
grant execute on function public.set_my_builder_availability(text) to authenticated;

notify pgrst, 'reload schema';
