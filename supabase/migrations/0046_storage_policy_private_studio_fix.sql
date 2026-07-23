-- Storage evaluates all applicable SELECT policies when it returns an uploaded
-- object. The delivery/preview policies previously queried the private
-- studios.moderator_id column directly. That leaked a permission error into
-- unrelated uploads (including a studio logo). Keep the column private and
-- perform the moderator check through a narrow SECURITY DEFINER helper.

create or replace function public.is_studio_order_moderator(p_order uuid)
returns boolean
language sql
security definer
stable
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
      from public.orders o
      join public.studios s on s.id = o.studio_id
     where o.id = p_order
       and s.moderator_id = auth.uid()
  );
$$;

alter function public.is_studio_order_moderator(uuid) owner to postgres;
revoke all on function public.is_studio_order_moderator(uuid) from public;

drop policy if exists "deliverables: buyer-after-complete or builder-anytime" on storage.objects;
drop policy if exists "deliverables: buyer after complete or assigned builder" on storage.objects;
create policy "deliverables: buyer after complete or assigned builder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and (
           coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
           or (o.buyer_id = auth.uid() and o.status = 'completed')
           or public.is_studio_order_moderator(o.id)
         )
    )
  );

drop policy if exists "order_previews: any party reads anytime" on storage.objects;
drop policy if exists "order_previews: marketplace participants read" on storage.objects;
create policy "order_previews: marketplace participants read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or public.is_studio_order_moderator(o.id)
         )
    )
  );

notify pgrst, 'reload schema';
