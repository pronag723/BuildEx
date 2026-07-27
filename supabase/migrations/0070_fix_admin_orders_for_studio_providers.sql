-- Include studio orders in the moderator order queue. Studio orders intentionally
-- leave orders.builder_id null, so this must use left joins and the assigned
-- builder / studio moderator identity where available.

create or replace function public.admin_list_orders(
  p_filter text default 'all',
  p_query text default null
)
returns table (
  order_id uuid, status public.order_status, building_size text, size_label text,
  style text, brief text, price_kopecks int, commission_kopecks int,
  builder_earnings_kopecks int, conversation_id uuid, created_at timestamptz,
  paid_at timestamptz, delivered_at timestamptz, completed_at timestamptz,
  cancelled_at timestamptz, buyer_id uuid, buyer_username text,
  buyer_display_name text, buyer_avatar_url text, builder_id uuid,
  builder_username text, builder_display_name text, builder_avatar_url text,
  delivery_path text, delivery_file_name text, delivery_size bigint,
  preview_path text, preview_meta jsonb, has_preview boolean,
  dispute_reason text, dispute_status public.dispute_status,
  dispute_opened_at timestamptz, dispute_resolution_note text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then return; end if;
  return query
    select o.id, o.status, o.building_size, o.size_label, o.style, o.brief,
      o.price_kopecks, o.commission_kopecks, o.builder_earnings_kopecks,
      o.conversation_id, o.created_at, o.paid_at, o.delivered_at, o.completed_at,
      o.cancelled_at, buyer.id, buyer.username, buyer.display_name, buyer.avatar_url,
      coalesce(assigned.id, independent.id, studio_owner.id),
      coalesce(assigned.username, independent.username, studio_owner.username, studio.slug),
      coalesce(assigned.display_name, independent.display_name, studio_owner.display_name, studio.name),
      coalesce(assigned.avatar_url, independent.avatar_url, studio_owner.avatar_url),
      delivery.storage_path, delivery.file_name, delivery.size_bytes, delivery.preview_path,
      delivery.preview_meta, (delivery.preview_path is not null), dispute.reason,
      dispute.status, dispute.created_at, dispute.resolution_note
    from public.orders o
    join public.profiles buyer on buyer.id = o.buyer_id
    left join public.profiles independent on independent.id = o.builder_id
    left join public.studios studio on studio.id = o.studio_id
    left join public.profiles assigned on assigned.id = o.assigned_builder_id
    left join public.profiles studio_owner on studio_owner.id = studio.moderator_id
    left join public.order_deliveries delivery on delivery.order_id = o.id
    left join public.disputes dispute on dispute.order_id = o.id
    where (case v_filter when 'open_disputes' then o.status = 'disputed'
                         when 'rejected' then dispute.id is not null else true end)
      and (v_query is null or concat_ws(' ', o.id::text, buyer.username, buyer.display_name,
        assigned.username, assigned.display_name, independent.username, independent.display_name,
        studio_owner.username, studio.name, studio.slug, o.style, o.building_size,
        o.size_label, o.status::text) ilike '%' || v_query || '%')
    order by coalesce(dispute.created_at, o.created_at) desc limit 200;
end;
$$;

create or replace function public.admin_get_user_orders(p_user uuid)
returns table (
  order_id uuid, status public.order_status, building_size text, size_label text,
  buyer_username text, buyer_display_name text, builder_earnings_kopecks int,
  created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then return; end if;
  return query
    select o.id, o.status, o.building_size, o.size_label, buyer.username,
      buyer.display_name, coalesce(o.employee_owed_kopecks, o.builder_earnings_kopecks), o.created_at
    from public.orders o
    join public.profiles buyer on buyer.id = o.buyer_id
    left join public.studios studio on studio.id = o.studio_id
    where o.builder_id = p_user or o.assigned_builder_id = p_user or studio.moderator_id = p_user
    order by o.created_at desc;
end;
$$;

notify pgrst, 'reload schema';
