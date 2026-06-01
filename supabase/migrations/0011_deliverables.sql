-- =============================================================================
-- BuildEx — Escrow-style world-file delivery (Stage 6)
--
-- The builder uploads the finished world to a PRIVATE Storage bucket. The
-- file stays locked to the buyer until they confirm completion of the order,
-- which is when the platform releases escrow. That gating is enforced in two
-- layers so a bug in the UI can't leak the file:
--
--   • Storage RLS on bucket 'deliverables':
--       INSERT: only the order's builder, only while order.status='in_progress',
--               only into the path <order_id>/...
--       SELECT: the builder (anytime), OR the buyer iff order.status='completed'.
--
--   • Application RPCs:
--       builder_attach_delivery  records the delivery row + transitions the
--                                order to 'delivered' (the canonical Stage 6
--                                deliver path; replaces the bare builder_deliver
--                                from Stage 2 in the UI, which we leave in place
--                                as a no-file fallback for tests).
--       get_delivery_info        returns the delivery payload + a boolean
--                                saying whether the caller may download right
--                                now. The client then asks the Storage API for
--                                a short-lived signed URL using the returned
--                                path; if the caller isn't entitled, storage
--                                RLS denies the SELECT regardless.
--
-- Signed URL generation cannot be done in plpgsql (Supabase signs URLs with
-- the storage service's HMAC key, which lives outside Postgres). Keeping the
-- locked/unlocked logic in the DB still works because the storage SELECT
-- policy is the actual gatekeeper — the client just orchestrates the call.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. Private bucket ───────────────────────────────────────────────────────
-- 200 MB cap is a sensible default for Minecraft world ZIPs; raise later if
-- needed. Bucket stays `public=false` so nobody can fetch via getPublicUrl.
insert into storage.buckets (id, name, public, file_size_limit)
values ('deliverables', 'deliverables', false, 209715200)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ─── 2. order_deliveries ────────────────────────────────────────────────────
create table if not exists public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  note text,
  created_at timestamptz not null default now(),
  -- One delivery row per order keeps the data model simple; if the builder
  -- needs to re-upload, the application can replace the row before delivery
  -- in a later stage.
  constraint order_deliveries_unique_order unique (order_id)
);

create index if not exists order_deliveries_order_idx
  on public.order_deliveries (order_id);

alter table public.order_deliveries enable row level security;

-- Both parties may read the delivery metadata once it exists (the file itself
-- is still gated by storage RLS).
drop policy if exists "participants read order_deliveries" on public.order_deliveries;
create policy "participants read order_deliveries"
  on public.order_deliveries for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.buyer_id = auth.uid() or o.builder_id = auth.uid())
    )
  );

-- No direct INSERT/UPDATE/DELETE policies — mutations only happen via the
-- builder_attach_delivery RPC (SECURITY DEFINER).

-- ─── 3. Storage RLS on the 'deliverables' bucket ────────────────────────────
-- The first path segment is the order id; everything else (timestamp,
-- filename) is the builder's choice. storage.foldername returns the segments
-- as text[], so [1] is "<order_id>".

drop policy if exists "deliverables: builder writes own order" on storage.objects;
create policy "deliverables: builder writes own order"
  on storage.objects for insert
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

-- The builder may update/delete their own pre-delivery upload (e.g. to
-- replace a botched file before calling builder_attach_delivery). After
-- the order is delivered the path becomes effectively read-only because the
-- INSERT policy stops matching once status moves past 'in_progress'.
drop policy if exists "deliverables: builder mutates own pre-delivery" on storage.objects;
create policy "deliverables: builder mutates own pre-delivery"
  on storage.objects for update
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

drop policy if exists "deliverables: builder removes own pre-delivery" on storage.objects;
create policy "deliverables: builder removes own pre-delivery"
  on storage.objects for delete
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.builder_id = auth.uid()
        and o.status = 'in_progress'
    )
  );

-- The crucial SELECT policy — this is what enforces the escrow lock. The
-- builder may always re-download their own upload. The buyer can only
-- download once they've confirmed completion, which is the same moment
-- escrow is released.
drop policy if exists "deliverables: buyer-after-complete or builder-anytime" on storage.objects;
create policy "deliverables: buyer-after-complete or builder-anytime"
  on storage.objects for select
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (
          o.builder_id = auth.uid()
          or (o.buyer_id = auth.uid() and o.status = 'completed')
        )
    )
  );

-- ─── 4. builder_attach_delivery RPC ─────────────────────────────────────────
-- Records the delivery and transitions in_progress -> delivered in one step.
-- Posts an order_event into the chat (reusing the helpers from
-- 0010_chat_order_events.sql) so the buyer sees "Delivered — file attached"
-- with the file name.
create or replace function public.builder_attach_delivery(
  p_order     uuid,
  p_path      text,
  p_file_name text,
  p_size      bigint,
  p_note      text
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

  -- Path must start with the order id (matches storage RLS so the row and
  -- the object describe the same thing).
  if split_part(p_path, '/', 1) <> p_order::text then
    raise exception 'Storage path must be scoped to this order';
  end if;

  -- Upsert keeps re-upload cheap (the unique constraint would otherwise
  -- fail a retry); the builder can swap the file before transitioning by
  -- calling this again with a new path.
  insert into public.order_deliveries (order_id, storage_path, file_name, size_bytes, note)
  values (p_order, p_path, p_file_name, p_size, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (order_id) do update
    set storage_path = excluded.storage_path,
        file_name    = excluded.file_name,
        size_bytes   = excluded.size_bytes,
        note         = excluded.note,
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
      'note', nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  return v_delivery_id;
end;
$$;

revoke all on function public.builder_attach_delivery(uuid, text, text, bigint, text) from public;
grant execute on function public.builder_attach_delivery(uuid, text, text, bigint, text) to authenticated;

-- ─── 5. get_delivery_info RPC ───────────────────────────────────────────────
-- Returns the delivery metadata plus an `unlocked` flag describing whether
-- this caller is currently allowed to download the file. The client uses the
-- returned `storage_path` with supabase.storage.createSignedUrl(); the
-- storage SELECT policy above is the final word on whether that signed URL
-- actually resolves.
create or replace function public.get_delivery_info(p_order uuid)
returns table (
  storage_path text,
  file_name    text,
  size_bytes   bigint,
  note         text,
  created_at   timestamptz,
  status       public.order_status,
  is_buyer     boolean,
  is_builder   boolean,
  unlocked     boolean
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
        or (me = v_buyer and v_status = 'completed') as unlocked
    from public.order_deliveries d
    where d.order_id = p_order;
end;
$$;

revoke all on function public.get_delivery_info(uuid) from public;
grant execute on function public.get_delivery_info(uuid) to authenticated;

-- Reload PostgREST so the new RPCs are visible immediately.
notify pgrst, 'reload schema';
