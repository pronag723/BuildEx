-- Correct the small-order custody strategy:
--   * buyers may pay USDT on BSC or TRON;
--   * each payment stays in its matching custody balance;
--   * builders are still paid USDT-BSC only;
--   * managed studios cannot be configured below BuildEx's 9% Master floor.

alter table public.payments
  drop constraint if exists payments_requested_currency_check;
alter table public.payments
  add constraint payments_requested_currency_check
  check (
    requested_currency is null
    or requested_currency in ('usdtbsc', 'usdttrc20')
  );

create or replace function public._validate_paid_payment_rail()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_signed_currency text := lower(nullif(new.raw ->> 'pay_currency', ''));
begin
  if new.status <> 'paid' then return new; end if;
  if v_signed_currency not in ('usdtbsc', 'usdttrc20') then
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
  new.provider_payment_id := coalesce(
    nullif(new.raw ->> 'payment_id', ''),
    new.provider_payment_id
  );
  new.provider_status := coalesce(
    nullif(new.raw ->> 'payment_status', ''),
    new.provider_status
  );
  return new;
end;
$$;

create or replace function public.record_pending_payment(
  p_order uuid,
  p_invoice text,
  p_amount_cents int,
  p_requested_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(p_requested_currency) not in ('usdtbsc', 'usdttrc20') then
    raise exception 'Unsupported payment currency';
  end if;
  insert into public.payments (
    order_id, invoice_id, amount_cents, status, requested_currency, provider_status
  )
  values (
    p_order, p_invoice, p_amount_cents, 'pending',
    lower(p_requested_currency), 'waiting'
  )
  on conflict (order_id) do update
    set invoice_id = excluded.invoice_id,
        amount_cents = excluded.amount_cents,
        requested_currency = excluded.requested_currency,
        provider_status = excluded.provider_status,
        status = case when public.payments.status = 'paid' then 'paid' else 'pending' end;
end;
$$;
revoke all on function public.record_pending_payment(uuid, text, int, text) from public;
grant execute on function public.record_pending_payment(uuid, text, int, text) to service_role;

-- The current live project has no managed studio rows. Keeping this update
-- makes the migration safe for seeded/dev databases before replacing the check.
update public.studios
   set platform_commission_bps = 900
 where platform_commission_bps is not null
   and platform_commission_bps < 900;

alter table public.studios
  drop constraint if exists studios_platform_commission_check;
alter table public.studios
  add constraint studios_platform_commission_check
  check (
    platform_commission_bps is null
    or platform_commission_bps between 900 and 10000
  );

create or replace function public.admin_configure_managed_studio(
  p_studio uuid,
  p_platform_commission_bps int,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_buildex_admin();
  if p_platform_commission_bps not between 900 and 10000 then
    raise exception 'Commission must be between 9 and 100 percent';
  end if;
  if p_status not in ('pending', 'active', 'suspended') then
    raise exception 'Invalid studio status';
  end if;
  update public.studios
     set platform_commission_bps = p_platform_commission_bps,
         status = p_status,
         accepting_orders = case when p_status = 'active' then accepting_orders else false end
   where id = p_studio and moderator_id is not null;
  if not found then raise exception 'Managed studio not found'; end if;
end;
$$;
revoke all on function public.admin_configure_managed_studio(uuid, int, text) from public;
grant execute on function public.admin_configure_managed_studio(uuid, int, text) to authenticated;
