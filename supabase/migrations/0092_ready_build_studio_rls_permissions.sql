-- Keep protected studio ownership columns private while allowing ready-build
-- RLS policies to recognize the current studio moderator safely.

create or replace function public.is_studio_moderator(p_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.studios
    where id = p_studio
      and moderator_id = auth.uid()
  );
$$;

alter function public.is_studio_moderator(uuid) owner to postgres;
revoke all on function public.is_studio_moderator(uuid) from public;
grant execute on function public.is_studio_moderator(uuid) to anon, authenticated;

drop policy if exists "buyers read purchases" on public.ready_build_purchases;
create policy "buyers read purchases"
  on public.ready_build_purchases for select
  using (
    buyer_id = auth.uid()
    or builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
  );

drop policy if exists "participants read ready payments" on public.ready_build_payments;
create policy "participants read ready payments"
  on public.ready_build_payments for select
  using (
    exists (
      select 1
      from public.ready_build_purchases purchase
      where purchase.id = purchase_id
        and (
          purchase.buyer_id = auth.uid()
          or purchase.builder_id = auth.uid()
          or public.is_studio_moderator(purchase.studio_id)
        )
    )
  );

drop policy if exists "sellers read ready payouts" on public.ready_build_payouts;
create policy "sellers read ready payouts"
  on public.ready_build_payouts for select
  using (
    builder_id = auth.uid()
    or public.is_studio_moderator(studio_id)
  );

notify pgrst, 'reload schema';
