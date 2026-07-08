-- =============================================================================
-- BuildEx - payment reconciliation + fiat/card payout queue   [Stage 12 hardening]
--
-- Follow-up to 0031/0033:
--   * aligns builder_profiles.payout_method with the account UI
--     (usdt_trc20 / usdt_erc20 / fiat_card instead of legacy crypto/card)
--   * queues fiat/card withdrawal requests for admin off-ramp handling without
--     storing raw card numbers
--   * rejects paid webhooks whose fiat amount/currency does not match the order
--
-- Idempotent - safe to re-run.
-- =============================================================================

-- 1. Builder payout methods.

do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.builder_profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%payout_method%'
  loop
    execute format('alter table public.builder_profiles drop constraint %I', c);
  end loop;
end$$;

update public.builder_profiles
   set payout_method = case payout_method
     when 'crypto' then 'usdt_trc20'
     when 'card' then 'fiat_card'
     else payout_method
   end
 where payout_method in ('crypto', 'card');

update public.builder_profiles
   set payout_details = null
 where payout_method = 'fiat_card'
   and payout_details ~ '(\d[ -]?){12,19}';

alter table public.builder_profiles
  add constraint builder_profiles_payout_method_check
  check (payout_method is null or payout_method in ('usdt_trc20', 'usdt_erc20', 'fiat_card'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.builder_profiles'::regclass
       and conname = 'builder_profiles_no_raw_card_payout_details'
  ) then
    alter table public.builder_profiles
      add constraint builder_profiles_no_raw_card_payout_details
      check (
        payout_method is distinct from 'fiat_card'
        or payout_details is null
        or payout_details !~ '(\d[ -]?){12,19}'
      );
  end if;
end$$;

-- 2. Payout queue status shape.

do $$
declare
  c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.payouts'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
       and pg_get_constraintdef(oid) ilike '%pending%'
  loop
    execute format('alter table public.payouts drop constraint %I', c);
  end loop;
end$$;

alter table public.payouts
  add constraint payouts_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'blocked', 'fiat_card_pending'));

create or replace function public._enqueue_payout(p_order uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_builder       uuid;
  v_earnings      int;
  v_destination   text;
  v_method        text;
  v_currency      text;
  v_status        text;
  v_raw           jsonb := null;
begin
  if exists (select 1 from public.payouts where order_id = p_order) then
    return;
  end if;

  select o.builder_id, o.builder_earnings_kopecks
    into v_builder, v_earnings
    from public.orders o
   where o.id = p_order;

  if v_builder is null then
    return;
  end if;

  select nullif(btrim(coalesce(payout_details, '')), ''),
         coalesce(payout_method, 'usdt_trc20')
    into v_destination, v_method
    from public.builder_profiles
   where id = v_builder;

  if v_destination is null then
    v_currency := case v_method
      when 'usdt_erc20' then 'usdterc20'
      when 'fiat_card' then 'FIAT'
      else 'usdttrc20'
    end;
    v_status := 'blocked';
  elsif v_method = 'fiat_card' then
    v_currency := 'FIAT';
    v_status := 'fiat_card_pending';
    v_raw := jsonb_build_object(
      'method', 'fiat_card',
      'note', 'Admin must complete this payout through the NOWPayments off-ramp/dashboard. Raw card numbers are not stored.'
    );
  else
    v_currency := case v_method
      when 'usdt_erc20' then 'usdterc20'
      else 'usdttrc20'
    end;
    v_status := 'pending';
  end if;

  insert into public.payouts (order_id, builder_id, amount_cents, currency, destination, status, raw)
  values (p_order, v_builder, coalesce(v_earnings, 0), v_currency, v_destination, v_status, v_raw);
end;
$$;

revoke all on function public._enqueue_payout(uuid) from public;

create or replace function public.admin_requeue_payout(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_builder uuid;
  v_destination text;
  v_method text;
  v_status text;
  v_currency text;
  v_next_status text;
begin
  perform public._require_admin();

  select builder_id, status into v_builder, v_status
    from public.payouts where id = p_payout for update;
  if v_builder is null then
    raise exception 'Payout not found';
  end if;
  if v_status not in ('blocked', 'failed') then
    raise exception 'Only blocked or failed payouts can be re-queued';
  end if;

  select nullif(btrim(coalesce(payout_details, '')), ''),
         coalesce(payout_method, 'usdt_trc20')
    into v_destination, v_method
    from public.builder_profiles where id = v_builder;
  if v_destination is null then
    raise exception 'Builder still has no payout destination on file';
  end if;

  if v_method = 'fiat_card' then
    v_currency := 'FIAT';
    v_next_status := 'fiat_card_pending';
  else
    v_currency := case v_method
      when 'usdt_erc20' then 'usdterc20'
      else 'usdttrc20'
    end;
    v_next_status := 'pending';
  end if;

  update public.payouts
     set status = v_next_status,
         currency = v_currency,
         destination = v_destination,
         provider_batch_id = null,
         raw = case
           when v_method = 'fiat_card' then jsonb_build_object(
             'method', 'fiat_card',
             'note', 'Admin must complete this payout through the NOWPayments off-ramp/dashboard. Raw card numbers are not stored.'
           )
           else raw
         end
   where id = p_payout;
end;
$$;

revoke all on function public.admin_requeue_payout(uuid) from public;
grant execute on function public.admin_requeue_payout(uuid) to authenticated;

create or replace function public.admin_mark_fiat_payout_sent(
  p_payout uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();

  update public.payouts
     set status = 'sent',
         sent_at = now(),
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
           'method', 'fiat_card',
           'completed_manually', true,
           'note', nullif(btrim(coalesce(p_note, '')), '')
         )
   where id = p_payout
     and status = 'fiat_card_pending';

  if not found then
    raise exception 'Fiat/card payout not found or not pending manual send';
  end if;
end;
$$;

revoke all on function public.admin_mark_fiat_payout_sent(uuid, text) from public;
grant execute on function public.admin_mark_fiat_payout_sent(uuid, text) to authenticated;

-- 3. Payment reconciliation hardening.

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

  if p_amount_cents is not null and p_amount_cents <> v_price then
    raise exception 'Payment amount mismatch for order %: got %, expected %',
      p_order, p_amount_cents, v_price;
  end if;

  v_currency := lower(coalesce(p_raw ->> 'price_currency', 'usd'));
  if v_currency <> 'usd' then
    raise exception 'Payment currency mismatch for order %: got %, expected usd',
      p_order, v_currency;
  end if;

  insert into public.payments (order_id, invoice_id, amount_cents, method, status, raw)
  values (
    p_order,
    p_invoice,
    coalesce(p_amount_cents, v_price),
    nullif(p_method, ''),
    'paid',
    p_raw
  )
  on conflict (order_id) do update
    set invoice_id = coalesce(excluded.invoice_id, public.payments.invoice_id),
        amount_cents = excluded.amount_cents,
        method     = coalesce(excluded.method, public.payments.method),
        status     = 'paid',
        raw        = coalesce(excluded.raw, public.payments.raw);

  if v_status <> 'pending_payment' then
    return;
  end if;

  update public.orders
     set status = 'paid',
         paid_at = now()
   where id = p_order;
end;
$$;

revoke all on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) from public;
grant execute on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) to service_role;

notify pgrst, 'reload schema';
