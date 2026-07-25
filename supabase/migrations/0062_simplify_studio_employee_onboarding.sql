-- Studio employee code onboarding collects identity only. Studios, not their
-- employees, own the storefront's rates, portfolio and client-facing status.
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
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select pending_employee_code into v_code from public.builder_profiles where id = me;
  if v_code is null then raise exception 'No pending studio registration'; end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = me and role in ('builder', 'both') and onboarding_completed_at is null
       and username is not null and length(trim(display_name)) >= 2
  ) then raise exception 'Complete your name and nickname first'; end if;
  select c.studio_id into v_studio
    from public.studio_employee_codes c join public.studios s on s.id = c.studio_id
   where c.code = v_code and c.status = 'active' and s.status in ('pending', 'active')
     and (c.expires_at is null or c.expires_at > now()) and c.redemptions_used < c.max_redemptions
   for update of c;
  if v_studio is null then raise exception 'That employee code is invalid, expired, or full'; end if;
  update public.studio_employee_codes set redemptions_used = redemptions_used + 1
   where studio_id = v_studio and code = v_code and redemptions_used < max_redemptions;
  if not found then raise exception 'That employee code is full'; end if;
  update public.builder_profiles
     set profile_type = 'studio_employee', studio_id = v_studio,
         availability_status = 'available', is_available = true,
         pending_employee_code = null
   where id = me;
  update public.profiles set onboarding_completed_at = now() where id = me;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source)
  values (v_studio, me, 'available', null)
  returning id into v_membership;
  return v_membership;
end;
$$;
revoke all on function public.complete_pending_studio_employee_registration() from public;
grant execute on function public.complete_pending_studio_employee_registration() to authenticated;

notify pgrst, 'reload schema';
