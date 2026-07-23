-- Several managed-studio RLS policies introduced in 0041-0044 queried the
-- private studios.moderator_id column as the requesting browser role. After
-- 0044 limited browser access to public storefront columns, reads covered by
-- those policies could fail with "permission denied for table studios".
-- PostgreSQL must authorize every table/column referenced by a policy before it
-- can evaluate a different participant or admin branch.
--
-- Keep moderator ownership private and expose only the boolean authorization
-- decision needed by RLS.

create or replace function public.is_studio_moderator(p_studio uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
      from public.studios s
     where s.id = p_studio
       and s.moderator_id = auth.uid()
  );
$$;

alter function public.is_studio_moderator(uuid) owner to postgres;
revoke all on function public.is_studio_moderator(uuid) from public;
grant execute on function public.is_studio_moderator(uuid) to anon, authenticated;

drop policy if exists "public reads active studio portfolio" on public.studio_portfolio_images;
create policy "public reads active studio portfolio"
  on public.studio_portfolio_images for select
  using (
    exists (
      select 1
        from public.studios s
       where s.id = studio_portfolio_images.studio_id
         and s.status = 'active'
    )
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "moderator manages studio portfolio" on public.studio_portfolio_images;
create policy "moderator manages studio portfolio"
  on public.studio_portfolio_images for all to authenticated
  using (public.is_studio_moderator(studio_id))
  with check (public.is_studio_moderator(studio_id));

drop policy if exists "moderator reads employee codes" on public.studio_employee_codes;
create policy "moderator reads employee codes"
  on public.studio_employee_codes for select to authenticated
  using (
    public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "members and moderator read memberships" on public.studio_memberships;
create policy "members and moderator read memberships"
  on public.studio_memberships for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "assignment participants read" on public.studio_order_assignments;
create policy "assignment participants read"
  on public.studio_order_assignments for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "earnings participant read" on public.studio_employee_earnings;
create policy "earnings participant read"
  on public.studio_employee_earnings for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "participants read payouts" on public.payouts;
create policy "participants read payouts"
  on public.payouts for select to authenticated
  using (
    builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "participants read orders" on public.orders;
create policy "participants read orders"
  on public.orders for select to authenticated
  using (
    auth.uid() = buyer_id
    or auth.uid() = builder_id
    or auth.uid() = assigned_builder_id
    or public.is_studio_moderator(studio_id)
    or exists (
      select 1
        from public.studio_order_assignments a
       where a.order_id = orders.id
         and a.builder_id = auth.uid()
    )
  );

drop policy if exists "participants read payments" on public.payments;
create policy "participants read payments"
  on public.payments for select to authenticated
  using (
    exists (
      select 1
        from public.orders o
       where o.id = payments.order_id
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or public.is_studio_moderator(o.studio_id)
         )
    )
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

drop policy if exists "participants and admins read disputes" on public.disputes;
create policy "participants and admins read disputes"
  on public.disputes for select to authenticated
  using (
    exists (
      select 1
        from public.orders o
       where o.id = disputes.order_id
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or public.is_studio_moderator(o.studio_id)
         )
    )
    or exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_admin
    )
  );

notify pgrst, 'reload schema';
