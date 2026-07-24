-- Managed-studio tables deliberately retain order and finance history, but
-- several of their profile foreign keys use ON DELETE RESTRICT. Account
-- deletion must detach those references before auth.users cascades to profiles.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public._purge_user_storage(v_uid);

  -- Preserve the storefront and its order history, but release a moderator's
  -- login so an administrator can recover the suspended studio later.
  update public.studios
     set status = 'suspended',
         accepting_orders = false,
         moderator_id = null
   where moderator_id = v_uid;

  -- Invites are administrative scratch data. Claimed-by already uses SET NULL,
  -- while created-by is RESTRICT, so remove invites created by this account.
  delete from public.studio_moderator_invites
   where created_by = v_uid;

  -- A deleted employee cannot remain assigned to an order. The order itself
  -- belongs to the studio and is preserved for the buyer and finance history.
  update public.orders
     set assigned_builder_id = null
   where assigned_builder_id = v_uid;

  delete from public.studio_order_assignments
   where builder_id = v_uid;

  delete from public.studio_employee_earnings
   where builder_id = v_uid;

  delete from public.studio_memberships
   where builder_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';
