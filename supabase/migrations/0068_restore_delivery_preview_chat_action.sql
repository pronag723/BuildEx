-- Restore the preview availability flag accidentally omitted when migration
-- 0043 expanded builder_attach_delivery for managed studios. The chat delivery
-- card uses this flag to decide whether to offer its inline 3D viewer.

create or replace function public.builder_attach_delivery(
  p_order uuid,
  p_path text,
  p_file_name text,
  p_size bigint,
  p_note text default null,
  p_preview_path text default null,
  p_preview_meta jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_builder uuid; v_assigned uuid;
  v_status public.order_status; v_delivery uuid; v_conv uuid; v_buyer uuid;
  v_studio uuid; v_moderator uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_size <= 0 or p_size > 1073741824 then raise exception 'Invalid delivery size'; end if;
  select builder_id, assigned_builder_id, status, conversation_id, buyer_id, studio_id
    into v_builder, v_assigned, v_status, v_conv, v_buyer, v_studio
    from public.orders where id = p_order for update;
  if coalesce(v_assigned, v_builder) <> me then
    raise exception 'Only the assigned builder can deliver';
  end if;
  if v_status <> 'in_progress' then raise exception 'Order is not ready for delivery'; end if;
  if split_part(p_path, '/', 1) <> p_order::text then
    raise exception 'Storage path must be scoped to this order';
  end if;
  if p_preview_path is not null and split_part(p_preview_path, '/', 1) <> p_order::text then
    raise exception 'Preview path must be scoped to this order';
  end if;

  insert into public.order_deliveries (
    order_id, storage_path, file_name, size_bytes, note, preview_path, preview_meta
  )
  values (
    p_order, p_path, p_file_name, p_size,
    nullif(btrim(coalesce(p_note, '')), ''), p_preview_path, p_preview_meta
  )
  on conflict (order_id) do update
    set storage_path = excluded.storage_path, file_name = excluded.file_name,
        size_bytes = excluded.size_bytes, note = excluded.note,
        preview_path = excluded.preview_path, preview_meta = excluded.preview_meta,
        created_at = now()
  returning id into v_delivery;

  update public.orders set status = 'delivered', delivered_at = now() where id = p_order;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, me, 'Delivery uploaded - review it before confirming completion.',
    'order_event',
    jsonb_build_object(
      'event', 'delivered',
      'order_id', p_order,
      'file_name', p_file_name,
      'has_preview', (p_preview_path is not null)
    )
  );
  perform public._notify(v_buyer, 'delivered', 'Delivery ready',
    'Review the delivery and confirm when you are satisfied.',
    '/orders/?id=' || p_order::text);
  if v_studio is not null then
    select moderator_id into v_moderator from public.studios where id = v_studio;
    perform public._notify(v_moderator, 'delivered', 'Studio order delivered',
      'The assigned employee uploaded the delivery.', '/orders/?id=' || p_order::text);
  end if;
  return v_delivery;
end;
$$;

revoke all on function public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) from public;
grant execute on function public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) to authenticated;
