-- =============================================================================
-- BuildEx - fail-closed payment webhook reconciliation
--
-- A verified NOWPayments IPN must still contain the exact fiat amount and
-- currency requested by BuildEx.  Do not accept NULL/missing values as a match.
-- =============================================================================

create or replace function public.mark_order_paid_internal(
  p_order uuid,
  p_invoice text default null,
  p_amount_cents int default null,
  p_method text default null,
  p_raw jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_price int;
  v_currency text;
begin
  select status, price_kopecks into v_status, v_price
    from public.orders where id = p_order for update;

  if v_status is null then
    raise exception 'Order not found';
  end if;

  if p_amount_cents is null or p_amount_cents <> v_price then
    raise exception 'Payment amount mismatch for order %: got %, expected %',
      p_order, p_amount_cents, v_price;
  end if;

  v_currency := lower(p_raw ->> 'price_currency');
  if v_currency is distinct from 'usd' then
    raise exception 'Payment currency mismatch for order %: got %, expected usd',
      p_order, v_currency;
  end if;

  insert into public.payments (order_id, invoice_id, amount_cents, method, status, raw)
  values (
    p_order,
    p_invoice,
    p_amount_cents,
    nullif(p_method, ''),
    'paid',
    p_raw
  )
  on conflict (order_id) do update
    set invoice_id = coalesce(excluded.invoice_id, public.payments.invoice_id),
        amount_cents = excluded.amount_cents,
        method = coalesce(excluded.method, public.payments.method),
        status = 'paid',
        raw = coalesce(excluded.raw, public.payments.raw);

  if v_status <> 'pending_payment' then
    return;
  end if;

  update public.orders
     set status = 'paid', paid_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) from public;
grant execute on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) to service_role;

notify pgrst, 'reload schema';
