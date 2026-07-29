-- Expand the buyer checkout catalog while keeping a finite, reconciled set of
-- currencies. Edge Functions additionally require merchant enablement and a
-- live NOWPayments minimum before an invoice can be created.

alter table public.payments
  drop constraint if exists payments_requested_currency_check;
alter table public.payments
  add constraint payments_requested_currency_check
  check (
    requested_currency is null
    or requested_currency in (
      'usdttrc20', 'usdtbsc', 'usdc', 'btc', 'eth', 'sol', 'ton',
      'trx', 'xrp', 'ltc', 'doge', 'ada', 'bch'
    )
  );

create or replace function public._validate_paid_payment_rail()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_signed_currency text := lower(nullif(new.raw ->> 'pay_currency', ''));
begin
  if new.status <> 'paid' then return new; end if;
  if v_signed_currency not in (
    'usdttrc20', 'usdtbsc', 'usdc', 'btc', 'eth', 'sol', 'ton',
    'trx', 'xrp', 'ltc', 'doge', 'ada', 'bch'
  ) then
    raise exception 'Unsupported signed payment currency';
  end if;
  if tg_op = 'UPDATE'
     and old.requested_currency is not null
     and old.requested_currency <> v_signed_currency then
    raise exception 'Signed payment rail does not match the requested rail';
  end if;
  new.requested_currency := coalesce(new.requested_currency, v_signed_currency);
  new.actual_received_currency := coalesce(
    lower(nullif(new.raw ->> 'outcome_currency', '')),
    v_signed_currency,
    new.actual_received_currency
  );
  new.provider_payment_id := coalesce(nullif(new.raw ->> 'payment_id', ''), new.provider_payment_id);
  new.provider_status := coalesce(nullif(new.raw ->> 'payment_status', ''), new.provider_status);
  return new;
end;
$$;

create or replace function public.record_pending_payment(
  p_order uuid, p_invoice text, p_amount_cents int, p_requested_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(p_requested_currency) not in (
    'usdttrc20', 'usdtbsc', 'usdc', 'btc', 'eth', 'sol', 'ton',
    'trx', 'xrp', 'ltc', 'doge', 'ada', 'bch'
  ) then raise exception 'Unsupported payment currency'; end if;
  insert into public.payments (
    order_id, invoice_id, amount_cents, status, requested_currency, provider_status
  ) values (
    p_order, p_invoice, p_amount_cents, 'pending', lower(p_requested_currency), 'waiting'
  ) on conflict (order_id) do update
    set invoice_id = excluded.invoice_id,
        amount_cents = excluded.amount_cents,
        requested_currency = excluded.requested_currency,
        provider_status = excluded.provider_status,
        status = case when public.payments.status = 'paid' then 'paid' else 'pending' end;
end;
$$;
revoke all on function public.record_pending_payment(uuid, text, int, text) from public;
grant execute on function public.record_pending_payment(uuid, text, int, text) to service_role;
