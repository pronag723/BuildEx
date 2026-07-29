-- Crypto-only checkout: $5 marketplace floor, live multi-network USDT invoices,
-- and fee-free-to-the-builder USDT-BSC weekly payouts.

-- Preserve the latest placement logic while lowering both authoritative floors.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.place_order(uuid,text,text,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'v_price < 2000', 'v_price < 500');
  v_definition := replace(v_definition, '$20.00', '$5.00');
  execute v_definition;

  select pg_get_functiondef('public.place_studio_order(uuid,text,text,text)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, 'v_price < 2000', 'v_price < 500');
  v_definition := replace(v_definition, '$20.00', '$5.00');
  execute v_definition;
end;
$$;

alter table public.payments
  add column if not exists requested_currency text,
  add column if not exists actual_received_currency text,
  add column if not exists crypto_amount numeric,
  add column if not exists provider_fee numeric,
  add column if not exists provider_payment_id text,
  add column if not exists provider_status text;

alter table public.payments
  drop constraint if exists payments_requested_currency_check;
alter table public.payments
  add constraint payments_requested_currency_check
  check (
    requested_currency is null
    or requested_currency in ('usdtbsc', 'usdtmatic', 'usdtsol')
  );

create or replace function public._validate_paid_payment_rail()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_signed_currency text := lower(nullif(new.raw ->> 'pay_currency', ''));
begin
  if new.status <> 'paid' then return new; end if;
  if v_signed_currency not in ('usdtbsc', 'usdtmatic', 'usdtsol') then
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

drop trigger if exists payments_validate_paid_rail on public.payments;
create trigger payments_validate_paid_rail
  before insert or update on public.payments
  for each row execute function public._validate_paid_payment_rail();

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
  if lower(p_requested_currency) not in ('usdtbsc', 'usdtmatic', 'usdtsol') then
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

create or replace function public.record_payment_event(
  p_order uuid,
  p_provider_status text,
  p_raw jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested text := lower(nullif(p_raw ->> 'pay_currency', ''));
  v_actual text := lower(coalesce(
    nullif(p_raw ->> 'outcome_currency', ''),
    nullif(p_raw ->> 'pay_currency', '')
  ));
  v_crypto text := coalesce(
    nullif(p_raw ->> 'actually_paid', ''),
    nullif(p_raw ->> 'pay_amount', '')
  );
  v_fee text := coalesce(
    nullif(p_raw ->> 'fee', ''),
    nullif(p_raw ->> 'network_fee', '')
  );
begin
  update public.payments
     set provider_status = nullif(p_provider_status, ''),
         provider_payment_id = coalesce(
           nullif(p_raw ->> 'payment_id', ''),
           provider_payment_id
         ),
         actual_received_currency = coalesce(v_actual, actual_received_currency),
         crypto_amount = case
           when v_crypto ~ '^\d+(\.\d+)?$' then v_crypto::numeric
           else crypto_amount
         end,
         provider_fee = case
           when v_fee ~ '^\d+(\.\d+)?$' then v_fee::numeric
           else provider_fee
         end,
         raw = p_raw
   where order_id = p_order
     and (v_requested is null or requested_currency = v_requested);
end;
$$;
revoke all on function public.record_payment_event(uuid, text, jsonb) from public;
grant execute on function public.record_payment_event(uuid, text, jsonb) to service_role;

-- Existing non-BSC preferences are deliberately cleared so nobody can
-- accidentally send a BEP-20 payout to a legacy TRON destination.
update public.builder_profiles
   set payout_method = null, payout_details = null
 where payout_method is distinct from 'usdt_bsc'
    or coalesce(payout_details, '') !~ '^0x[0-9a-fA-F]{40}$';
update public.studios
   set payout_method = null, payout_details = null
 where payout_method is distinct from 'usdt_bsc'
    or coalesce(payout_details, '') !~ '^0x[0-9a-fA-F]{40}$';
update public.payouts
   set status = 'failed',
       raw = coalesce(raw, '{}'::jsonb) ||
         jsonb_build_object(
           'migration_note',
           'Legacy non-BSC request released; save a BSC address and request again'
         )
 where status in ('requested', 'approved')
   and payout_method is distinct from 'usdt_bsc';

alter table public.builder_profiles
  drop constraint if exists builder_profiles_payout_method_check;
alter table public.builder_profiles
  add constraint builder_profiles_payout_method_check
  check (payout_method is null or payout_method = 'usdt_bsc');
alter table public.builder_profiles
  drop constraint if exists builder_profiles_payout_details_format_check;
alter table public.builder_profiles
  add constraint builder_profiles_payout_details_format_check
  check (
    (payout_method is null and payout_details is null)
    or (
      payout_method = 'usdt_bsc'
      and payout_details is not null
      and btrim(payout_details) ~ '^0x[0-9a-fA-F]{40}$'
    )
  );

alter table public.studios
  drop constraint if exists studios_payout_method_check;
alter table public.studios
  add constraint studios_payout_method_check
  check (payout_method is null or payout_method = 'usdt_bsc');

-- Historical payout rows keep their original network for auditability. New
-- request functions below can only create USDT-BSC rows.
alter table public.payouts
  drop constraint if exists payouts_method_check;
alter table public.payouts
  add constraint payouts_method_check
  check (
    payout_method is null
    or payout_method in ('usdt_bsc', 'usdt_trc20', 'usdt_erc20', 'sepa_eur')
  );

create or replace function public._validate_studio_payout_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.payout_method is not distinct from old.payout_method
     and new.payout_details is not distinct from old.payout_details then
    return new;
  end if;
  if new.payout_method is null and new.payout_details is null then return new; end if;
  if new.payout_method = 'usdt_bsc'
     and btrim(coalesce(new.payout_details, '')) ~ '^0x[0-9a-fA-F]{40}$' then
    return new;
  end if;
  raise exception 'Enter a valid USDT BSC/BEP-20 wallet address';
end;
$$;

-- Update the current studio settings function without discarding later business
-- rules that were added after the original studio migration.
do $$
declare v_definition text;
begin
  select pg_get_functiondef(
    'public.update_my_studio(text,text,text,jsonb,integer,boolean,text,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, '''usdt_trc20''', '''usdt_bsc''');
  v_definition := replace(v_definition, '''usdt_erc20''', '''usdt_bsc''');
  v_definition := replace(
    v_definition,
    '^T[A-HJ-NP-Za-km-z1-9]{33}$',
    '^0x[0-9a-fA-F]{40}$'
  );
  v_definition := replace(v_definition, 'USDT TRC-20', 'USDT BSC/BEP-20');
  v_definition := replace(v_definition, 'USDT ERC-20', 'USDT BSC/BEP-20');
  execute v_definition;
end;
$$;

create or replace function public.request_withdrawal(p_amount_cents int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_destination text; v_available int; v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_amount_cents is null or p_amount_cents < 2000 then
    raise exception 'Minimum withdrawal is $20.00';
  end if;
  select nullif(btrim(coalesce(payout_details, '')), '')
    into v_destination
    from public.builder_profiles
   where id = me and payout_method = 'usdt_bsc'
   for update;
  if v_destination is null or v_destination !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'Save a valid USDT BSC/BEP-20 payout address first';
  end if;
  v_available := public._builder_available_balance(me);
  if p_amount_cents > v_available then
    raise exception 'Withdrawal exceeds available balance';
  end if;
  insert into public.payouts (
    order_id, builder_id, amount_cents, currency, destination,
    payout_method, provider, status
  ) values (
    null, me, p_amount_cents, 'usdtbsc', v_destination,
    'usdt_bsc', 'nowpayments', 'requested'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_withdrawal(int) from public;
grant execute on function public.request_withdrawal(int) to authenticated;

create or replace function public.request_studio_withdrawal(p_amount_cents int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid; v_details text; v_summary jsonb; v_id uuid;
begin
  if p_amount_cents is null or p_amount_cents < 2000 then
    raise exception 'Minimum withdrawal is $20.00';
  end if;
  select id, nullif(btrim(coalesce(payout_details, '')), '')
    into v_studio, v_details
    from public.studios
   where moderator_id = auth.uid() and payout_method = 'usdt_bsc'
   for update;
  if v_studio is null then raise exception 'Studio not found'; end if;
  if v_details is null or v_details !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'Save a valid USDT BSC/BEP-20 payout address first';
  end if;
  v_summary := public.get_my_studio_payout_summary();
  if p_amount_cents > (v_summary ->> 'available_cents')::bigint then
    raise exception 'Insufficient studio balance';
  end if;
  insert into public.payouts (
    order_id, builder_id, studio_id, amount_cents, currency, destination,
    payout_method, provider, status
  ) values (
    null, null, v_studio, p_amount_cents, 'usdtbsc', v_details,
    'usdt_bsc', 'nowpayments', 'requested'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_studio_withdrawal(int) from public;
grant execute on function public.request_studio_withdrawal(int) to authenticated;

create or replace function public.admin_approve_withdrawal(
  p_payout uuid,
  p_fee_amount_cents int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if coalesce(p_fee_amount_cents, 0) <> 0 then
    raise exception 'BuildEx absorbs payout fees; builder deduction must be zero';
  end if;
  update public.payouts
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = null, fee_amount_cents = 0,
         net_amount_cents = amount_cents
   where id = p_payout and status = 'requested'
     and payout_method = 'usdt_bsc';
  if not found then raise exception 'Withdrawal is not approvable'; end if;
end;
$$;
revoke all on function public.admin_approve_withdrawal(uuid, int) from public;
grant execute on function public.admin_approve_withdrawal(uuid, int) to authenticated;

create or replace function public.claim_payout_batch(
  p_payouts uuid[],
  p_claim_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_updated int;
begin
  if p_claim_id is null or p_claim_id !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid payout claim';
  end if;
  if p_payouts is null or cardinality(p_payouts) = 0
     or cardinality(p_payouts) <> (
       select count(distinct payout_id)
         from unnest(p_payouts) as ids(payout_id)
     ) then
    raise exception 'Payout IDs must be non-empty and unique';
  end if;
  update public.payouts
     set status = 'processing', provider_batch_id = 'claim:' || p_claim_id
   where id = any(p_payouts)
     and status = 'approved'
     and payout_method = 'usdt_bsc'
     and currency = 'usdtbsc';
  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(p_payouts) then
    raise exception 'One or more payouts have already been claimed';
  end if;
end;
$$;
revoke all on function public.claim_payout_batch(uuid[], text) from public;
grant execute on function public.claim_payout_batch(uuid[], text) to service_role;

create or replace function public.finalize_payout_claim(
  p_claim_id text,
  p_batch_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set provider_batch_id = p_batch_id
   where status = 'processing'
     and provider_batch_id = 'claim:' || p_claim_id;
  if not found then raise exception 'Payout claim not found'; end if;
end;
$$;
revoke all on function public.finalize_payout_claim(text, text) from public;
grant execute on function public.finalize_payout_claim(text, text) to service_role;

create or replace function public.release_payout_claim(p_claim_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'failed', provider_batch_id = null,
         raw = coalesce(raw, '{}'::jsonb) ||
           jsonb_build_object('error', 'Provider rejected payout batch creation')
   where status = 'processing'
     and provider_batch_id = 'claim:' || p_claim_id;
end;
$$;
revoke all on function public.release_payout_claim(text) from public;
grant execute on function public.release_payout_claim(text) to service_role;

notify pgrst, 'reload schema';
