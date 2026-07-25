-- Allow an invited builder to read the public studio fields embedded in their
-- pending invitation. This is intentionally limited to the invited studio and
-- does not expose private studio settings or team data.

drop policy if exists "invited builders read invited studio" on public.studios;
create policy "invited builders read invited studio"
  on public.studios for select
  using (exists (
    select 1
      from public.studio_builder_invitations i
     where i.studio_id = studios.id
       and i.builder_id = auth.uid()
       and i.status = 'pending'
  ));

notify pgrst, 'reload schema';
