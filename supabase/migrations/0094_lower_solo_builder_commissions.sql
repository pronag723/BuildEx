-- Lower the standard commission schedule for solo builders.
-- Managed-studio commission settings remain unchanged.
create or replace function public.commission_bps_for_rank(p_rank text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rank
    when 'master'   then 500
    when 'expert'   then 800
    when 'advanced' then 1200
    else 1500
  end;
$$;
