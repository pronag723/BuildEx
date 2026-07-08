-- =============================================================================
-- BuildEx - builder-controlled balances and withdrawal requests
--
-- Completed orders are the earnings ledger. A withdrawal reserves part of that
-- ledger; payouts are no longer created automatically per completed order.
-- =============================================================================

-- Expand payout destinations. SEPA remains disabled in request_withdrawal until
-- NOWPayments approves marketplace-beneficiary payouts for this account.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.builder_profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%payout_method%'
  loop
    execute format('alter table public.builder_profiles drop constraint %I', c);
  end loop;
end$$;

update public.builder_profiles
   set payout_method = 'sepa_eur', payout_details = null
 where payout_method = 'fiat_card';

alter table public.builder_profiles
  add constraint builder_profiles_payout_method_check
  check (payout_method is null or payout_method in ('usdt_trc20', 'usdt_erc20', 'sepa_eur'));

-- Turn the existing provider queue into a user-requested withdrawal ledger.
alter table public.payouts
  alter column order_id drop not null,
  add column if not exists payout_method text,
  add column if not exists fee_amount_cents int
    check (fee_amount_cents is null or fee_amount_cents >= 0),
  add column if not exists net_amount_cents int
    check (net_amount_cents is null or net_amount_cents >= 0),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) <= 500);

update public.payouts
   set payout_method = case lower(currency)
     when 'usdterc20' then 'usdt_erc20'
     when 'fiat' then 'sepa_eur'
     else 'usdt_trc20'
   end
 where payout_method is null;

-- Existing real crypto work remains reserved. Invalid/blocked/manual-card rows
-- are released back into the builder's available balance.
update public.payouts set status = 'approved' where status = 'pending';
update public.payouts
   set status = 'rejected',
       reviewed_at = now(),
       rejection_reason = case
         when status = 'fiat_card_pending'
           then 'Legacy card request released: NOWPayments does not support direct card payouts.'
         else 'Legacy blocked payout released to builder balance.'
       end
 where status in ('blocked', 'fiat_card_pending');

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.payouts'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.payouts drop constraint %I', c);
  end loop;
end$$;

alter table public.payouts
  add constraint payouts_status_check
  check (status in (
    'requested', 'approved', 'processing', 'sent',
    'rejected', 'failed', 'cancelled'
  )),
  add constraint payouts_method_check
  check (payout_method is null or payout_method in ('usdt_trc20', 'usdt_erc20', 'sepa_eur'));

create index if not exists payouts_builder_status_idx
  on public.payouts (builder_id, status, created_at desc);

-- Keep old completion functions compatible while disabling automatic payouts.
create or replace function public._enqueue_payout(p_order uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  return;
end;
$$;
revoke all on function public._enqueue_payout(uuid) from public;

-- One authoritative balance calculation, used by reads and request validation.
create or replace function public._builder_available_balance(p_builder uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce((
      select sum(o.builder_earnings_kopecks)::bigint
        from public.orders o
       where o.builder_id = p_builder and o.status = 'completed'
    ), 0)
    -
    coalesce((
      select sum(p.amount_cents)::bigint
        from public.payouts p
       where p.builder_id = p_builder
         and p.status in ('requested', 'approved', 'processing', 'sent')
    ), 0)
  )::int;
$$;
revoke all on function public._builder_available_balance(uuid) from public;

create or replace function public.get_my_payout_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_available int;
  v_pending int;
  v_paid int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.builder_profiles where id = me) then
    raise exception 'Builder profile required';
  end if;

  v_available := public._builder_available_balance(me);
  select
    coalesce(sum(amount_cents) filter (
      where status in ('requested', 'approved', 'processing')
    ), 0)::int,
    coalesce(sum(coalesce(net_amount_cents, amount_cents)) filter (where status = 'sent'), 0)::int
  into v_pending, v_paid
  from public.payouts where builder_id = me;

  return jsonb_build_object(
    'available_cents', v_available,
    'pending_cents', v_pending,
    'paid_cents', v_paid,
    'minimum_cents', 2000,
    'sepa_enabled', false
  );
end;
$$;
revoke all on function public.get_my_payout_summary() from public;
grant execute on function public.get_my_payout_summary() to authenticated;

create or replace function public.request_withdrawal(p_amount_cents int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_method text;
  v_destination text;
  v_available int;
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_amount_cents is null or p_amount_cents < 2000 then
    raise exception 'Minimum withdrawal is $20.00';
  end if;

  select payout_method, nullif(btrim(coalesce(payout_details, '')), '')
    into v_method, v_destination
    from public.builder_profiles
   where id = me
   for update;

  if not found then raise exception 'Builder profile required'; end if;
  if v_method = 'sepa_eur' then
    raise exception 'EUR SEPA withdrawals are awaiting provider approval';
  end if;
  if v_method not in ('usdt_trc20', 'usdt_erc20') or v_destination is null then
    raise exception 'Save a crypto payout destination first';
  end if;
  if v_method = 'usdt_trc20' and v_destination !~ '^T[A-HJ-NP-Za-km-z1-9]{33}$' then
    raise exception 'Invalid USDT TRC-20 address';
  end if;
  if v_method = 'usdt_erc20' and v_destination !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'Invalid USDT ERC-20 address';
  end if;

  v_available := public._builder_available_balance(me);
  if p_amount_cents > v_available then
    raise exception 'Withdrawal exceeds available balance';
  end if;

  insert into public.payouts (
    order_id, builder_id, amount_cents, currency, destination,
    payout_method, provider, status
  ) values (
    null, me, p_amount_cents,
    case v_method when 'usdt_erc20' then 'usdterc20' else 'usdttrc20' end,
    v_destination, v_method, 'nowpayments', 'requested'
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.request_withdrawal(int) from public;
grant execute on function public.request_withdrawal(int) to authenticated;

create or replace function public.cancel_withdrawal(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'cancelled'
   where id = p_payout and builder_id = auth.uid() and status = 'requested';
  if not found then raise exception 'Withdrawal cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_withdrawal(uuid) from public;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;

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
  if p_fee_amount_cents is null or p_fee_amount_cents < 0 then
    raise exception 'A non-negative provider fee is required';
  end if;
  update public.payouts
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = null,
         fee_amount_cents = p_fee_amount_cents,
         net_amount_cents = amount_cents - p_fee_amount_cents
   where id = p_payout and status = 'requested' and payout_method <> 'sepa_eur'
     and p_fee_amount_cents < amount_cents;
  if not found then raise exception 'Withdrawal is not approvable'; end if;
end;
$$;
revoke all on function public.admin_approve_withdrawal(uuid, int) from public;
grant execute on function public.admin_approve_withdrawal(uuid, int) to authenticated;

create or replace function public.admin_reject_withdrawal(
  p_payout uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.payouts
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500)
   where id = p_payout and status in ('requested', 'approved', 'failed');
  if not found then raise exception 'Withdrawal is not rejectable'; end if;
end;
$$;
revoke all on function public.admin_reject_withdrawal(uuid, text) from public;
grant execute on function public.admin_reject_withdrawal(uuid, text) to authenticated;

-- Provider status transitions now operate on approved user requests.
create or replace function public.mark_payouts_processing(p_payouts uuid[], p_batch_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'processing', provider_batch_id = p_batch_id
   where id = any(p_payouts) and status = 'approved';
end;
$$;
revoke all on function public.mark_payouts_processing(uuid[], text) from public;
grant execute on function public.mark_payouts_processing(uuid[], text) to service_role;

create or replace function public.mark_payouts_sent(p_batch_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'sent', sent_at = now(),
         raw = coalesce(p_raw, raw),
         net_amount_cents = coalesce(net_amount_cents, amount_cents)
   where provider_batch_id = p_batch_id and status = 'processing';
end;
$$;
revoke all on function public.mark_payouts_sent(text, jsonb) from public;
grant execute on function public.mark_payouts_sent(text, jsonb) to service_role;

create or replace function public.mark_payouts_failed(p_batch_id text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts
     set status = 'failed',
         raw = coalesce(raw, '{}'::jsonb) ||
           jsonb_build_object('error', coalesce(p_note, 'Provider payout failed'))
   where provider_batch_id = p_batch_id and status = 'processing';
end;
$$;
revoke all on function public.mark_payouts_failed(text, text) from public;
grant execute on function public.mark_payouts_failed(text, text) to service_role;

notify pgrst, 'reload schema';
