-- Let a studio moderator delete their login without erasing order, payout, or
-- studio history. The studio is suspended and released so an administrator can
-- recover it later; the existing auth.users cascade then removes the profile.

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

  update public.studios
     set status = 'suspended',
         accepting_orders = false,
         moderator_id = null
   where moderator_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
