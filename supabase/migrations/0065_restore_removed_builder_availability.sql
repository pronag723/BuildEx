-- A removed studio employee returns to an independent account immediately.
-- They must recreate marketplace pricing and provide a portfolio before becoming
-- Available, but must not be stranded in incomplete registration state: the
-- account settings page is where those missing details are supplied.

create or replace function public.remove_studio_employee(p_builder uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid;
begin
  select id into v_studio from public.studios where moderator_id = auth.uid();
  if v_studio is null then raise exception 'Studio not found'; end if;
  if exists (
    select 1 from public.studio_order_assignments a
     where a.studio_id = v_studio and a.builder_id = p_builder and a.released_at is null
  ) then raise exception 'Reassign or finish this employee''s active order first'; end if;

  update public.studio_memberships
     set status = 'removed', removed_at = now(), availability_status = 'busy', busy_source = null
   where studio_id = v_studio and builder_id = p_builder and status = 'active';
  if not found then raise exception 'Active employee not found'; end if;

  update public.builder_profiles
     set profile_type = 'independent', studio_id = null,
         studio_promo_bps = null, studio_promo_ends_at = null,
         rates = '{}'::jsonb, availability_status = 'busy', is_available = false
   where id = p_builder;
  -- Keep the completed account alive. Availability has its own independent
  -- profile-completeness check below.
  update public.profiles
     set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_builder;
end;
$$;

-- Repair accounts removed while migration 0064 was active. Limit this to
-- builders with a recorded removal so incomplete new registrations are untouched.
update public.profiles p
   set onboarding_completed_at = now()
 where p.onboarding_completed_at is null
   and exists (
     select 1 from public.builder_profiles bp
      where bp.id = p.id and bp.profile_type = 'independent'
   )
   and exists (
     select 1 from public.studio_memberships m
      where m.builder_id = p.id and m.status = 'removed'
   )
   and not exists (
     select 1 from public.studio_memberships m
      where m.builder_id = p.id and m.status = 'active'
   );

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
       and bp.profile_type = 'independent'
       and jsonb_typeof(bp.rates) = 'object' and bp.rates <> '{}'::jsonb
       and exists (select 1 from public.portfolio_images pi where pi.builder_id = bp.id)
       and not exists (
         select 1 from public.studio_memberships m
          where m.builder_id = bp.id and m.status = 'active'
       )
  ) then
    raise exception 'Add your independent rates and at least one portfolio image before becoming available';
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
