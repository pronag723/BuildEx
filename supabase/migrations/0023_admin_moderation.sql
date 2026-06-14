-- =============================================================================
-- BuildEx — Moderator console (admin moderation tooling)
--
-- The /admin area was a bare open-disputes queue. Moderators need to actually
-- investigate: see every rejected (disputed) order, read its chat, download the
-- delivered world file, and open the 3D preview — none of which the orders /
-- messages / storage RLS lets a non-party do. This migration adds the admin
-- read paths, all gated on profiles.is_admin (set in 0015):
--
--   • admin_list_orders(filter)  — orders + parties + delivery + dispute context
--   • admin_get_messages(order)  — an order's conversation, read-only
--   • storage SELECT policies     — admins may read deliverables + order_previews
--     so the client can mint signed URLs for the file + preview.
--
-- Every function self-checks is_admin (returns empty rather than erroring for
-- non-admins), mirroring list_open_disputes in 0015. Idempotent.
-- =============================================================================

-- ─── 1. Admin storage read access (deliverables + order_previews) ────────────
-- createSignedUrl is gated by a storage.objects SELECT policy, so granting
-- admins SELECT on these buckets is what lets the moderator download the world
-- file (regardless of escrow state) and load the 3D preview.
drop policy if exists "deliverables: admins read all" on storage.objects;
create policy "deliverables: admins read all"
  on storage.objects for select
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

drop policy if exists "order_previews: admins read all" on storage.objects;
create policy "order_previews: admins read all"
  on storage.objects for select
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

-- ─── 2. admin_list_orders RPC ───────────────────────────────────────────────
-- Filters:
--   'open_disputes' (default) → orders currently 'disputed' (open dispute)
--   'rejected'                → orders that have ANY dispute row (open/resolved)
--   'all'                     → every order
-- Returns the full moderation context for each row in one shot, including the
-- delivery storage paths the client signs for download/preview.
create or replace function public.admin_list_orders(p_filter text default null)
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
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'open_disputes');
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    return;  -- not an admin → empty result, no error
  end if;

  return query
    select
      o.id, o.status, o.building_size, o.size_label, o.style, o.brief,
      o.price_kopecks, o.commission_kopecks, o.builder_earnings_kopecks,
      o.conversation_id, o.created_at, o.paid_at, o.delivered_at,
      o.completed_at, o.cancelled_at,
      b.id, b.username, b.display_name, b.avatar_url,
      bu.id, bu.username, bu.display_name, bu.avatar_url,
      d.storage_path, d.file_name, d.size_bytes,
      d.preview_path, d.preview_meta, (d.preview_path is not null),
      dp.reason, dp.status, dp.created_at, dp.resolution_note
    from public.orders o
    join public.profiles b  on b.id  = o.buyer_id
    join public.profiles bu on bu.id = o.builder_id
    left join public.order_deliveries d on d.order_id = o.id
    left join public.disputes dp on dp.order_id = o.id
    where
      case v_filter
        when 'all' then true
        when 'rejected' then dp.id is not null
        else o.status = 'disputed'  -- 'open_disputes'
      end
    order by coalesce(dp.created_at, o.created_at) desc;
end;
$$;

revoke all on function public.admin_list_orders(text) from public;
grant execute on function public.admin_list_orders(text) to authenticated;

-- ─── 3. admin_get_messages RPC ──────────────────────────────────────────────
-- An order's full conversation, read-only, with each sender's public identity.
create or replace function public.admin_get_messages(p_order uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text,
  body text,
  msg_type text,
  meta jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    return;  -- not an admin → empty result
  end if;

  select o.conversation_id into v_conv from public.orders o where o.id = p_order;
  if v_conv is null then
    return;
  end if;

  return query
    select m.id, m.sender_id, s.username, s.display_name, s.avatar_url,
           m.body, m.msg_type, m.meta, m.created_at
      from public.messages m
      join public.profiles s on s.id = m.sender_id
     where m.conversation_id = v_conv
     order by m.created_at asc;
end;
$$;

revoke all on function public.admin_get_messages(uuid) from public;
grant execute on function public.admin_get_messages(uuid) to authenticated;

notify pgrst, 'reload schema';
