-- =============================================================================
-- BuildEx — Custom rate tiers
--
-- Builders can now offer more than the three built-in sizes (small/medium/large)
-- by adding any number of custom tiers under generated keys in
-- builder_profiles.rates. Each tier carries its own { enabled, blocks, price,
-- label, icon, pos } — see lib/pricing.js.
--
-- For orders this means:
--   • orders.building_size may now hold a custom tier key, not just the enum.
--   • orders.size_label snapshots the tier's human name at order time, so order
--     dashboards / chat / the admin queue can render "Castle pack" even though
--     SIZE_META only knows the three built-ins.
--
-- This migration:
--   1. adds orders.size_label
--   2. relaxes the building_size CHECK (any non-empty key, ≤ 64 chars)
--   3. redefines place_order to accept any offered tier key + snapshot the label
--   4. redefines mark_order_paid so the chat "Order paid" card carries the label
--   5. redefines list_open_disputes to expose size_label to /admin
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ─── 1. size_label column ───────────────────────────────────────────────────
alter table public.orders
  add column if not exists size_label text;

-- ─── 2. relax the building_size CHECK ───────────────────────────────────────
-- The original inline check pinned building_size to ('small','medium','large').
-- Drop any check constraint that still references the column, then add a loose
-- non-empty guard so custom tier keys (e.g. "c1717…") are accepted.
do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.orders'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%building_size%'
  loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_building_size_nonempty'
  ) then
    alter table public.orders
      add constraint orders_building_size_nonempty
      check (char_length(btrim(building_size)) between 1 and 64);
  end if;
end$$;

-- ─── 3. place_order — accept any offered tier + snapshot its label ───────────
-- Redefinition of the 0014 version. Differences: the hard-coded size enum check
-- is gone (any key the builder actually offers is valid) and the tier's display
-- label is snapshotted into orders.size_label. Commission still comes from the
-- builder's current rank; everything else is preserved.
create or replace function public.place_order(
  p_builder uuid,
  p_size text,
  p_style text,
  p_brief text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_rates jsonb;
  v_tier jsonb;
  v_specialties text[];
  v_rank text;
  v_price int;
  v_commission int;
  v_earnings int;
  v_commission_bps int;
  v_label text;
  v_order_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_builder is null or p_builder = me then
    raise exception 'Invalid builder';
  end if;
  if p_size is null or char_length(btrim(p_size)) = 0 then
    raise exception 'Invalid size';
  end if;
  if p_style is null or char_length(btrim(p_style)) = 0 then
    raise exception 'Style is required';
  end if;
  if p_brief is null or char_length(btrim(p_brief)) = 0 then
    raise exception 'Brief is required';
  end if;

  select rates, specialties, rank
    into v_rates, v_specialties, v_rank
    from public.builder_profiles
   where id = p_builder;

  if v_rates is null then
    raise exception 'Builder not found';
  end if;

  v_tier := v_rates -> p_size;
  if v_tier is null
     or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Builder does not offer this size';
  end if;

  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price <= 0 then
    raise exception 'Builder has not set a price for this size';
  end if;

  if v_specialties is null or not (p_style = any(v_specialties)) then
    raise exception 'Style not offered by builder';
  end if;

  -- Snapshot the tier's human name so order surfaces don't depend on SIZE_META.
  v_label := nullif(btrim(coalesce(v_tier ->> 'label', '')), '');

  -- Commission rate comes from the builder's current rank (Stage 9).
  v_commission_bps := public.commission_bps_for_rank(coalesce(v_rank, 'rookie'));
  v_commission := (v_price * v_commission_bps) / 10000;
  v_earnings := v_price - v_commission;

  insert into public.orders (
    buyer_id, builder_id, building_size, size_label, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks,
    status
  )
  values (
    me, p_builder, p_size, v_label, p_style, p_brief,
    v_price, v_commission, v_earnings,
    'pending_payment'
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text) to authenticated;

-- ─── 4. mark_order_paid — carry size_label into the chat event meta ──────────
-- Redefinition of the 0010 version. Only addition: the snapshotted size_label is
-- selected and placed into the order_event meta so the "Order paid" chat card
-- can name a custom tier. Payment + escrow logic is unchanged (still MOCK).
create or replace function public.mark_order_paid(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_status public.order_status;
  v_size text;
  v_size_label text;
  v_style text;
  v_brief text;
  v_price int;
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, status, building_size, size_label, style, brief, price_kopecks
    into v_buyer, v_status, v_size, v_size_label, v_style, v_brief, v_price
    from public.orders where id = p_order for update;

  if v_buyer is null then
    raise exception 'Order not found';
  end if;
  if v_buyer <> me then
    raise exception 'Only the buyer can pay';
  end if;
  if v_status <> 'pending_payment' then
    raise exception 'Order is not awaiting payment';
  end if;

  update public.orders
     set status = 'paid',
         paid_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'paid',
    'Order paid — escrowed until you confirm the delivery.',
    jsonb_build_object(
      'size', v_size,
      'size_label', v_size_label,
      'style', v_style,
      'price_kopecks', v_price,
      'brief', v_brief
    )
  );
end;
$$;

revoke all on function public.mark_order_paid(uuid) from public;
grant execute on function public.mark_order_paid(uuid) to authenticated;

-- ─── 5. list_open_disputes — expose size_label to the admin queue ────────────
-- Redefinition of the 0015 version. Adds size_label to the returned columns so
-- /admin renders custom tier names. Admin self-check + ordering unchanged.
drop function if exists public.list_open_disputes();
create or replace function public.list_open_disputes()
returns table (
  dispute_id uuid,
  order_id uuid,
  reason text,
  opened_at timestamptz,
  building_size text,
  size_label text,
  style text,
  brief text,
  price_kopecks int,
  buyer_id uuid,
  buyer_username text,
  buyer_display_name text,
  builder_id uuid,
  builder_username text,
  builder_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    return;  -- not an admin → empty result, no error
  end if;

  return query
    select d.id, d.order_id, d.reason, d.created_at,
           o.building_size, o.size_label, o.style, o.brief, o.price_kopecks,
           b.id, b.username, b.display_name,
           bu.id, bu.username, bu.display_name
      from public.disputes d
      join public.orders o on o.id = d.order_id
      join public.profiles b on b.id = o.buyer_id
      join public.profiles bu on bu.id = o.builder_id
     where d.status = 'open'
     order by d.created_at asc;
end;
$$;

revoke all on function public.list_open_disputes() from public;
grant execute on function public.list_open_disputes() to authenticated;

-- Reload PostgREST schema cache so the redefined RPCs + new column are picked up.
notify pgrst, 'reload schema';
