-- GitHub Pages deploys the app but does not execute database migrations. Apply
-- this in Supabase after 0066 to update the live RPCs.

-- Old completed/cancelled assignments can be left unreleased by legacy data.
-- They are historical and must not lock a builder's employment availability.
update public.studio_order_assignments a
   set released_at = coalesce(a.released_at, now()),
       release_reason = coalesce(a.release_reason, 'historical_order_closed')
  from public.orders o
 where a.order_id = o.id
   and a.released_at is null
   and o.status in ('completed', 'cancelled');

create or replace function public.set_my_studio_availability(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('available', 'busy') then
    raise exception 'Invalid availability';
  end if;

  -- Only an assignment for an order that is still in flight controls this
  -- setting. Historical assignment rows must not leave the switch stuck.
  if exists (
    select 1
      from public.studio_order_assignments a
      join public.orders o on o.id = a.order_id
     where a.builder_id = auth.uid()
       and a.released_at is null
       and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
  ) then
    raise exception 'Availability is controlled by your active order';
  end if;

  update public.studio_memberships
     set availability_status = p_status,
         busy_source = case when p_status = 'busy' then 'manual' else null end
   where builder_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active studio membership not found'; end if;

  update public.builder_profiles
     set availability_status = p_status, is_available = (p_status = 'available')
   where id = auth.uid() and profile_type = 'studio_employee';
end;
$$;

revoke all on function public.set_my_studio_availability(text) from public;
grant execute on function public.set_my_studio_availability(text) to authenticated;

create or replace function public.remove_studio_employee(p_builder uuid, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid;
begin
  if upper(btrim(coalesce(p_confirmation, ''))) <> 'REMOVE' then
    raise exception 'Type REMOVE to confirm removing this builder';
  end if;
  select id into v_studio from public.studios where moderator_id = auth.uid();
  if v_studio is null then raise exception 'Studio not found'; end if;
  if exists (
    select 1 from public.studio_order_assignments a
     join public.orders o on o.id = a.order_id
     where a.studio_id = v_studio and a.builder_id = p_builder
       and a.released_at is null
       and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
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
  update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_builder;
end;
$$;

revoke all on function public.remove_studio_employee(uuid, text) from public;
grant execute on function public.remove_studio_employee(uuid, text) to authenticated;

notify pgrst, 'reload schema';
