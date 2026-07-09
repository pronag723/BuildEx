-- =============================================================================
-- BuildEx - manual admin settlement for builder withdrawals
--
-- Approved withdrawals are no longer pushed through an automated provider flow.
-- Admins review requests, send funds manually, then record the settlement or
-- failure here.
-- =============================================================================

alter table public.payouts
  add column if not exists payout_reference text
    check (payout_reference is null or char_length(payout_reference) <= 200),
  add column if not exists admin_note text
    check (admin_note is null or char_length(admin_note) <= 1000);

create or replace function public.admin_mark_withdrawal_sent(
  p_payout uuid,
  p_reference text default null,
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
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         payout_reference = left(nullif(btrim(coalesce(p_reference, '')), ''), 200),
         admin_note = left(nullif(btrim(coalesce(p_note, '')), ''), 1000),
         rejection_reason = null,
         net_amount_cents = coalesce(net_amount_cents, amount_cents)
   where id = p_payout and status = 'approved';

  if not found then
    raise exception 'Withdrawal is not ready to mark as sent';
  end if;
end;
$$;
revoke all on function public.admin_mark_withdrawal_sent(uuid, text, text) from public;
grant execute on function public.admin_mark_withdrawal_sent(uuid, text, text) to authenticated;

create or replace function public.admin_mark_withdrawal_failed(
  p_payout uuid,
  p_reason text default null,
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
     set status = 'failed',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = left(
           nullif(
             btrim(coalesce(p_reason, 'Provider payout failed; funds released.')),
             ''
           ),
           500
         ),
         admin_note = left(nullif(btrim(coalesce(p_note, '')), ''), 1000)
   where id = p_payout and status in ('approved', 'processing');

  if not found then
    raise exception 'Withdrawal is not ready to mark as failed';
  end if;
end;
$$;
revoke all on function public.admin_mark_withdrawal_failed(uuid, text, text) from public;
grant execute on function public.admin_mark_withdrawal_failed(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
