-- Allow a studio moderator to permanently remove an employee invite code.
-- The SECURITY DEFINER boundary keeps ownership checks private and prevents a
-- browser client from deleting another studio's codes directly.

create or replace function public.delete_studio_employee_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.studio_employee_codes c
   where c.id = p_code_id
     and exists (
       select 1
         from public.studios s
        where s.id = c.studio_id
          and s.moderator_id = auth.uid()
     );

  if not found then
    raise exception 'Employee code not found';
  end if;
end;
$$;

revoke all on function public.delete_studio_employee_code(uuid) from public;
grant execute on function public.delete_studio_employee_code(uuid) to authenticated;
