-- =============================================================================
-- BuildEx - lower the marketplace payment floor to $10
--
-- Buyer checkout is now pinned to USDT TRC-20 in the Edge Function. The exact
-- NOWPayments minimum remains dynamic and is checked live there, but the
-- marketplace's own minimum builder price is now $10 instead of $20.
-- =============================================================================

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
  if me is null then raise exception 'Not authenticated'; end if;
  if p_builder is null or p_builder = me then raise exception 'Invalid builder'; end if;
  if p_size is null or char_length(btrim(p_size)) = 0 then raise exception 'Invalid size'; end if;
  if p_style is null or char_length(btrim(p_style)) = 0 then raise exception 'Style is required'; end if;
  if p_brief is null or char_length(btrim(p_brief)) = 0 then raise exception 'Brief is required'; end if;

  select rates, specialties, rank
    into v_rates, v_specialties, v_rank
    from public.builder_profiles
   where id = p_builder;

  if v_rates is null then raise exception 'Builder not found'; end if;

  v_tier := v_rates -> p_size;
  if v_tier is null
     or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Builder does not offer this size';
  end if;

  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price <= 0 then
    raise exception 'Builder has not set a price for this size';
  end if;
  if v_price < 1000 then
    raise exception 'Minimum BuildEx order price is $10.00';
  end if;

  if v_specialties is null or not (p_style = any(v_specialties)) then
    raise exception 'Style not offered by builder';
  end if;

  v_label := nullif(btrim(coalesce(v_tier ->> 'label', '')), '');
  v_commission_bps := public.commission_bps_for_rank(coalesce(v_rank, 'rookie'));
  v_commission := (v_price * v_commission_bps) / 10000;
  v_earnings := v_price - v_commission;

  insert into public.orders (
    buyer_id, builder_id, building_size, size_label, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks, status
  )
  values (
    me, p_builder, p_size, v_label, p_style, p_brief,
    v_price, v_commission, v_earnings, 'pending_payment'
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
