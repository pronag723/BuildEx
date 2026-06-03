-- =============================================================================
-- BuildEx — 3D world preview artifact (Stage 7)
--
-- The buyer is asked to confirm & release escrow BEFORE they can download the
-- delivered world (the raw .zip is locked to status='completed' by the storage
-- policy in 0011_deliverables.sql). Stage 7 lets them review first: the builder's
-- browser turns the world into a compact colored-voxel artifact and uploads it
-- here, and the buyer renders it in three.js — without ever fetching the raw
-- world.
--
-- The artifact is a DERIVATIVE (surface voxels + colours), not the world, so
-- unlike the raw file it is readable by the buyer at ANY status — that's the
-- whole point of the review-before-release flow. It therefore needs its own
-- bucket with a looser SELECT policy than 'deliverables'; carving a sub-path out
-- of 'deliverables' would mean rewriting that bucket's escrow policy, so we keep
-- the two buckets separate and leave Stage 6 untouched.
--
--   • Storage RLS on bucket 'order_previews':
--       INSERT: only the order's builder, only while order.status='in_progress',
--               only into path <order_id>/...  (mirrors deliverables INSERT)
--       SELECT: any party to the order (buyer OR builder), ANY status.
--
--   • order_deliveries gains preview_path + preview_meta (nullable — a delivery
--     without a preview is valid; generation is best-effort client-side).
--
--   • builder_attach_delivery gains two optional params so the deliver call
--     records the .zip and the preview in one shot.
--   • get_delivery_info also returns the preview path/meta + a preview_available
--     flag.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. Private preview bucket ───────────────────────────────────────────────
-- Artifacts are tiny (surface voxels, gzipped) so a 25 MB cap is generous.
-- public=false — the buyer reads it via a short-lived signed URL, gated by the
-- SELECT policy below.
insert into storage.buckets (id, name, public, file_size_limit)
values ('order_previews', 'order_previews', false, 26214400)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ─── 2. order_deliveries: preview columns ───────────────────────────────────
alter table public.order_deliveries
  add column if not exists preview_path text,
  add column if not exists preview_meta jsonb;

-- ─── 3. Storage RLS on the 'order_previews' bucket ──────────────────────────
-- First path segment is the order id, same convention as deliverables.

drop policy if exists "order_previews: builder writes own order" on storage.objects;
create policy "order_previews: builder writes own order"
  on storage.objects for insert
  with check (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

-- Builder may replace a botched preview while still in_progress.
drop policy if exists "order_previews: builder mutates own pre-delivery" on storage.objects;
create policy "order_previews: builder mutates own pre-delivery"
  on storage.objects for update
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

drop policy if exists "order_previews: builder removes own pre-delivery" on storage.objects;
create policy "order_previews: builder removes own pre-delivery"
  on storage.objects for delete
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

-- The key difference from deliverables: BOTH parties may read the preview at
-- ANY status, because reviewing the build is exactly what must happen before
-- the buyer confirms (and thus before the raw file unlocks).
drop policy if exists "order_previews: any party reads anytime" on storage.objects;
create policy "order_previews: any party reads anytime"
  on storage.objects for select
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.buyer_id = auth.uid() or o.builder_id = auth.uid())
    )
  );

-- ─── 4. builder_attach_delivery — add optional preview params ───────────────
-- Re-declared with two trailing params (defaults null) so the existing 5-arg
-- call from Stage 6 still resolves while the Stage 7 client passes the preview.
create or replace function public.builder_attach_delivery(
  p_order        uuid,
  p_path         text,
  p_file_name    text,
  p_size         bigint,
  p_note         text,
  p_preview_path text default null,
  p_preview_meta jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_builder uuid;
  v_status public.order_status;
  v_conv uuid;
  v_delivery_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_path is null or char_length(btrim(p_path)) = 0 then
    raise exception 'Storage path required';
  end if;
  if p_file_name is null or char_length(btrim(p_file_name)) = 0 then
    raise exception 'File name required';
  end if;
  if p_size is null or p_size < 0 then
    raise exception 'Invalid file size';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then raise exception 'Order not found'; end if;
  if v_builder <> me  then raise exception 'Only the builder can deliver'; end if;
  if v_status <> 'in_progress' then
    raise exception 'Order is not in a deliverable state';
  end if;

  -- Both objects must be scoped to this order (matches the storage RLS so the
  -- rows and the objects describe the same order).
  if split_part(p_path, '/', 1) <> p_order::text then
    raise exception 'Storage path must be scoped to this order';
  end if;
  if p_preview_path is not null
     and split_part(p_preview_path, '/', 1) <> p_order::text then
    raise exception 'Preview path must be scoped to this order';
  end if;

  insert into public.order_deliveries
    (order_id, storage_path, file_name, size_bytes, note, preview_path, preview_meta)
  values
    (p_order, p_path, p_file_name, p_size,
     nullif(btrim(coalesce(p_note, '')), ''), p_preview_path, p_preview_meta)
  on conflict (order_id) do update
    set storage_path = excluded.storage_path,
        file_name    = excluded.file_name,
        size_bytes   = excluded.size_bytes,
        note         = excluded.note,
        preview_path = excluded.preview_path,
        preview_meta = excluded.preview_meta,
        created_at   = now()
  returning id into v_delivery_id;

  update public.orders
     set status = 'delivered',
         delivered_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'delivered',
    'Builder delivered the world — review and confirm to unlock the download.',
    jsonb_build_object(
      'file_name', p_file_name,
      'size_bytes', p_size,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'has_preview', (p_preview_path is not null)
    )
  );

  return v_delivery_id;
end;
$$;

-- Grant the new 7-arg signature. The original 5-arg function object still
-- exists (create-or-replace can't change a signature), so keep its grant too.
revoke all on function
  public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) from public;
grant execute on function
  public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) to authenticated;

-- ─── 5. get_delivery_info — surface the preview ─────────────────────────────
-- Adds preview_path, preview_meta, and preview_available. (CREATE OR REPLACE
-- can't change a function's OUT columns, so drop first.)
drop function if exists public.get_delivery_info(uuid);
create function public.get_delivery_info(p_order uuid)
returns table (
  storage_path      text,
  file_name         text,
  size_bytes        bigint,
  note              text,
  created_at        timestamptz,
  status            public.order_status,
  is_buyer          boolean,
  is_builder        boolean,
  unlocked          boolean,
  preview_path      text,
  preview_meta      jsonb,
  preview_available boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_builder uuid;
  v_status public.order_status;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select o.buyer_id, o.builder_id, o.status
    into v_buyer, v_builder, v_status
    from public.orders o where o.id = p_order;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if me <> v_buyer and me <> v_builder then
    raise exception 'Not a party to this order';
  end if;

  return query
    select
      d.storage_path,
      d.file_name,
      d.size_bytes,
      d.note,
      d.created_at,
      v_status,
      (me = v_buyer)   as is_buyer,
      (me = v_builder) as is_builder,
      (me = v_builder)
        or (me = v_buyer and v_status = 'completed') as unlocked,
      d.preview_path,
      d.preview_meta,
      (d.preview_path is not null) as preview_available
    from public.order_deliveries d
    where d.order_id = p_order;
end;
$$;

revoke all on function public.get_delivery_info(uuid) from public;
grant execute on function public.get_delivery_info(uuid) to authenticated;

-- Reload PostgREST so the changed RPC signatures are visible immediately.
notify pgrst, 'reload schema';
