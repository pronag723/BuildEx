-- BuildEx — moderator order search and payout-review history
--
-- The old moderator queue defaulted to disputes and required the browser to
-- rely on an unsearchable list. These admin-only RPCs keep the full order and
-- payout-review context behind one server-side authorization check.

drop function if exists public.admin_list_orders(text);

create function public.admin_list_orders(
  p_filter text default 'all',
  p_query text default null
)
returns table (
  order_id uuid,
  status public.order_status,
  building_size text,
  size_label text,
  style text,
  brief text,
  price_kopecks int,
  commission_kopecks int,
  builder_earnings_kopecks int,
  conversation_id uuid,
  created_at timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  buyer_id uuid,
  buyer_username text,
  buyer_display_name text,
  buyer_avatar_url text,
  builder_id uuid,
  builder_username text,
  builder_display_name text,
  builder_avatar_url text,
  delivery_path text,
  delivery_file_name text,
  delivery_size bigint,
  preview_path text,
  preview_meta jsonb,
  has_preview boolean,
  dispute_reason text,
  dispute_status public.dispute_status,
  dispute_opened_at timestamptz,
  dispute_resolution_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'all');
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    return;
  end if;

  return query
    select o.id, o.status, o.building_size, o.size_label, o.style, o.brief,
      o.price_kopecks, o.commission_kopecks, o.builder_earnings_kopecks,
      o.conversation_id, o.created_at, o.paid_at, o.delivered_at,
      o.completed_at, o.cancelled_at,
      buyer.id, buyer.username, buyer.display_name, buyer.avatar_url,
      builder.id, builder.username, builder.display_name, builder.avatar_url,
      delivery.storage_path, delivery.file_name, delivery.size_bytes,
      delivery.preview_path, delivery.preview_meta, (delivery.preview_path is not null),
      dispute.reason, dispute.status, dispute.created_at, dispute.resolution_note
    from public.orders o
    join public.profiles buyer on buyer.id = o.buyer_id
    join public.profiles builder on builder.id = o.builder_id
    left join public.order_deliveries delivery on delivery.order_id = o.id
    left join public.disputes dispute on dispute.order_id = o.id
    where (case v_filter
      when 'open_disputes' then o.status = 'disputed'
      when 'rejected' then dispute.id is not null
      else true
    end)
    and (v_query is null or concat_ws(' ', o.id::text, buyer.username, buyer.display_name,
      builder.username, builder.display_name, o.style, o.building_size, o.size_label,
      o.status::text) ilike '%' || v_query || '%')
    order by coalesce(dispute.created_at, o.created_at) desc
    limit 200;
end;
$$;

revoke all on function public.admin_list_orders(text, text) from public;
grant execute on function public.admin_list_orders(text, text) to authenticated;

create or replace function public.admin_get_user_orders(p_user uuid)
returns table (
  order_id uuid,
  status public.order_status,
  building_size text,
  size_label text,
  buyer_username text,
  buyer_display_name text,
  builder_earnings_kopecks int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    return;
  end if;

  return query
    select o.id, o.status, o.building_size, o.size_label, buyer.username,
      buyer.display_name, o.builder_earnings_kopecks, o.created_at
    from public.orders o
    join public.profiles buyer on buyer.id = o.buyer_id
    where o.builder_id = p_user
    order by o.created_at desc;
end;
$$;

revoke all on function public.admin_get_user_orders(uuid) from public;
grant execute on function public.admin_get_user_orders(uuid) to authenticated;

notify pgrst, 'reload schema';
