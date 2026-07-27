-- Studio employee availability is a manual preference. Assignments may overlap
-- and must not change or lock that preference.

drop index if exists public.studio_order_assignments_one_current_builder;

-- Restore builders whose status was set automatically by an order. Manual busy
-- choices are identified by busy_source = 'manual' and are left untouched.
update public.studio_memberships
   set availability_status = 'available', busy_source = null
 where status = 'active'
   and availability_status = 'busy'
   and busy_source = 'order';

update public.builder_profiles bp
   set availability_status = 'available', is_available = true
 where bp.profile_type = 'studio_employee'
   and exists (
     select 1
       from public.studio_memberships m
      where m.builder_id = bp.id
        and m.status = 'active'
        and m.availability_status = 'available'
   );

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

create or replace function public.assign_studio_order(
  p_order uuid,
  p_builder uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid; v_status public.order_status; v_old_builder uuid;
  v_employee_bps int; v_conv uuid; v_name text; v_buyer uuid;
begin
  select o.studio_id, o.status, o.assigned_builder_id, o.conversation_id, o.buyer_id
    into v_studio, v_status, v_old_builder, v_conv, v_buyer
    from public.orders o where o.id = p_order for update;
  if v_studio is null then raise exception 'Studio order not found'; end if;
  perform public._require_studio_moderator(v_studio);
  if v_status not in ('paid', 'in_progress') then
    raise exception 'Orders can only be assigned before delivery';
  end if;
  if v_old_builder = p_builder then return; end if;
  select employee_commission_bps into v_employee_bps
    from public.studios where id = v_studio;
  if v_employee_bps is null then raise exception 'Set the employee commission first'; end if;
  if not exists (
    select 1 from public.studio_memberships m
     where m.studio_id = v_studio and m.builder_id = p_builder
       and m.status = 'active' and m.availability_status = 'available'
  ) then raise exception 'Employee is not available'; end if;

  if v_old_builder is not null then
    update public.studio_order_assignments
       set released_at = now(), release_reason = 'reassigned'
     where order_id = p_order and released_at is null;
    perform public._notify(
      v_old_builder, 'reassigned', 'Studio order reassigned',
      'You have been released from this order. Your chat archive is now read-only.',
      '/orders/?id=' || p_order::text
    );
  end if;

  insert into public.studio_order_assignments (
    order_id, studio_id, builder_id, employee_commission_bps
  ) values (p_order, v_studio, p_builder, v_employee_bps);
  update public.orders
     set assigned_builder_id = p_builder,
         employee_commission_bps_snapshot = v_employee_bps,
         employee_owed_kopecks = (coalesce(studio_earnings_kopecks, 0) * v_employee_bps) / 10000
   where id = p_order;

  select coalesce(display_name, username, 'Builder') into v_name
    from public.profiles where id = p_builder;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, auth.uid(),
    case when v_old_builder is null
      then v_name || ' has been assigned to this order.'
      else 'The order has been reassigned to ' || v_name || '.'
    end,
    'order_event',
    jsonb_build_object(
      'event', case when v_old_builder is null then 'assigned' else 'reassigned' end,
      'order_id', p_order, 'assigned_builder_id', p_builder,
      'assigned_builder_name', v_name
    )
  );
  perform public._notify(
    p_builder, 'assigned', 'New studio order assigned',
    'You are now responsible for this client order.',
    '/orders/?id=' || p_order::text
  );
  perform public._notify(
    v_buyer,
    case when v_old_builder is null then 'assigned' else 'reassigned' end,
    case when v_old_builder is null then 'Builder assigned' else 'Builder changed' end,
    v_name || ' is now handling your studio order.',
    '/orders/?id=' || p_order::text
  );
end;
$$;

revoke all on function public.assign_studio_order(uuid, uuid) from public;
grant execute on function public.assign_studio_order(uuid, uuid) to authenticated;

create or replace function public._release_studio_assignment(
  p_order uuid,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare v_builder uuid; v_studio uuid;
begin
  select studio_id, assigned_builder_id into v_studio, v_builder
    from public.orders where id = p_order;
  if v_studio is null or v_builder is null then return; end if;

  update public.studio_order_assignments
     set released_at = coalesce(released_at, now()),
         release_reason = coalesce(release_reason, p_reason)
   where order_id = p_order and released_at is null;
end;
$$;

revoke all on function public._release_studio_assignment(uuid, text) from public;

notify pgrst, 'reload schema';
