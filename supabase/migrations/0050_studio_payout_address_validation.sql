-- Keep studio payout destinations safe at the data boundary as well as in the
-- account UI. NOT VALID preserves any legacy row that predates validation while
-- enforcing the rule for every new or updated destination.

alter table public.studios
  drop constraint if exists studios_payout_details_format_check;

alter table public.studios
  add constraint studios_payout_details_format_check
  check (
    (payout_method is null and payout_details is null)
    or (
      payout_method = 'usdt_trc20'
      and btrim(coalesce(payout_details, '')) ~ '^T[A-HJ-NP-Za-km-z1-9]{33}$'
    )
    or (
      payout_method = 'usdt_erc20'
      and btrim(coalesce(payout_details, '')) ~ '^0x[0-9a-fA-F]{40}$'
    )
    or (
      payout_method = 'sepa_eur'
      and payout_details is null
    )
  )
  not valid;
