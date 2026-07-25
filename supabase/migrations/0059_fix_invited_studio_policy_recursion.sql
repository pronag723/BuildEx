-- BuildEx — break the studio/invitation RLS policy cycle.
--
-- The invitation query embeds the invited studio. The policy added in 0058
-- checked studio_builder_invitations directly, while the moderator policy on
-- that table checks studios. PostgreSQL therefore re-entered the studios
-- policy while evaluating the invitation relation.

create or replace function public.is_invited_builder_for_studio(p_studio uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
      from public.studio_builder_invitations i
     where i.studio_id = p_studio
       and i.builder_id = auth.uid()
       and i.status = 'pending'
  );
$$;

alter function public.is_invited_builder_for_studio(uuid) owner to postgres;
revoke all on function public.is_invited_builder_for_studio(uuid) from public;
grant execute on function public.is_invited_builder_for_studio(uuid) to authenticated;

drop policy if exists "invited builders read invited studio" on public.studios;
create policy "invited builders read invited studio"
  on public.studios for select to authenticated
  using (public.is_invited_builder_for_studio(id));

notify pgrst, 'reload schema';
