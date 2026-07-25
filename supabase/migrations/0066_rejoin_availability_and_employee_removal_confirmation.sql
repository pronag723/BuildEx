-- Removal writes a safe busy fallback. A later invitation creates a new
-- employment relationship, so it must not inherit that fallback as a manual
-- availability preference.

create or replace function public.respond_to_studio_builder_invitation(
  p_invitation uuid,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_inv public.studio_builder_invitations%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('accept', 'decline') then raise exception 'Invalid invitation response'; end if;

  select * into v_inv from public.studio_builder_invitations
   where id = p_invitation and builder_id = me for update;
  if v_inv.id is null or v_inv.status <> 'pending' then raise exception 'Invitation is no longer pending'; end if;
  if p_response = 'decline' then
    update public.studio_builder_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return;
  end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;

  update public.builder_profiles
     set profile_type = 'studio_employee', studio_id = v_inv.studio_id,
         availability_status = 'available', is_available = true
   where id = me;
  if not found then raise exception 'Builder profile not found'; end if;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source)
  values (v_inv.studio_id, me, 'available', null);
  update public.studio_builder_invitations set status = 'accepted', responded_at = now() where id = v_inv.id;
end;
$$;

revoke all on function public.respond_to_studio_builder_invitation(uuid, text) from public;
grant execute on function public.respond_to_studio_builder_invitation(uuid, text) to authenticated;

-- Require the same deliberate confirmation in the RPC, so a direct client
-- call cannot bypass the dashboard's confirmation dialog.
drop function if exists public.remove_studio_employee(uuid);

create or replace function public.remove_studio_employee(p_builder uuid, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid;
begin
  if upper(btrim(coalesce(p_confirmation, ''))) <> 'DELETE' then
    raise exception 'Type DELETE to confirm removing this builder';
  end if;
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
  update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_builder;
end;
$$;

revoke all on function public.remove_studio_employee(uuid, text) from public;
grant execute on function public.remove_studio_employee(uuid, text) to authenticated;

-- Repair employees who were re-added before this migration. Limit the repair
-- to the exact historical pattern and never override an active order.
update public.studio_memberships current_membership
   set availability_status = 'available', busy_source = null
 where current_membership.status = 'active'
   and current_membership.availability_status = 'busy'
   and not exists (
     select 1 from public.studio_order_assignments a
      where a.builder_id = current_membership.builder_id and a.released_at is null
   )
   and exists (
     select 1 from public.studio_memberships removed_membership
      where removed_membership.studio_id = current_membership.studio_id
        and removed_membership.builder_id = current_membership.builder_id
        and removed_membership.status = 'removed'
        and removed_membership.removed_at < current_membership.joined_at
   );

update public.builder_profiles bp
   set availability_status = 'available', is_available = true
 where bp.profile_type = 'studio_employee'
   and bp.availability_status = 'busy'
   and exists (
     select 1 from public.studio_memberships current_membership
      where current_membership.builder_id = bp.id
        and current_membership.status = 'active'
        and current_membership.availability_status = 'available'
   );

notify pgrst, 'reload schema';
