-- Preserve legacy studio payout rows while making studio settings updates
-- return useful validation errors instead of a check-constraint failure.
--
-- Migration 0050 added its constraint NOT VALID, which preserved malformed
-- destinations but caused every later update to those rows (even a name-only
-- edit) to fail. A trigger can distinguish a payout change from an unrelated
-- row update, so legacy values remain available for manual review.

alter table public.studios
  drop constraint if exists studios_payout_details_format_check;

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

  if new.payout_method is null and new.payout_details is null then
    return new;
  elsif new.payout_method = 'usdt_trc20'
        and btrim(coalesce(new.payout_details, '')) ~ '^T[A-HJ-NP-Za-km-z1-9]{33}$' then
    return new;
  elsif new.payout_method = 'usdt_erc20'
        and btrim(coalesce(new.payout_details, '')) ~ '^0x[0-9a-fA-F]{40}$' then
    return new;
  elsif new.payout_method = 'sepa_eur' and new.payout_details is null then
    return new;
  end if;

  raise exception 'Enter a valid payout destination for the selected network';
end;
$$;

drop trigger if exists studios_validate_payout_details on public.studios;
create trigger studios_validate_payout_details
  before insert or update of payout_method, payout_details on public.studios
  for each row execute function public._validate_studio_payout_details();

create or replace function public.update_my_studio(
  p_name text,
  p_username text,
  p_avatar_url text,
  p_rates jsonb,
  p_employee_commission_bps int,
  p_accepting_orders boolean,
  p_payout_method text default null,
  p_payout_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_studio uuid;
  v_slug citext := lower(btrim(coalesce(p_username, '')))::citext;
  v_payout_method text := nullif(btrim(coalesce(p_payout_method, '')), '');
  v_payout_details text := nullif(btrim(coalesce(p_payout_details, '')), '');
  v_current_payout_method text;
  v_current_payout_details text;
  v_payout_changed boolean;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  select id, payout_method, payout_details
    into v_studio, v_current_payout_method, v_current_payout_details
    from public.studios
   where moderator_id = me;
  if v_studio is null then raise exception 'Studio not found'; end if;
  v_current_payout_method :=
    nullif(btrim(coalesce(v_current_payout_method, '')), '');
  v_current_payout_details :=
    nullif(btrim(coalesce(v_current_payout_details, '')), '');
  if p_employee_commission_bps not between 0 and 10000 then
    raise exception 'Employee commission must be between 0 and 100 percent';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Studio name must be between 2 and 80 characters';
  end if;
  if v_slug::text !~ '^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$' then
    raise exception 'Studio username must be 3-24 lowercase letters, numbers, or underscores';
  end if;

  if v_payout_details is null then
    v_payout_method := null;
  end if;
  v_payout_changed :=
    v_payout_method is distinct from v_current_payout_method
    or v_payout_details is distinct from v_current_payout_details;

  if v_payout_changed
     and v_payout_method = 'usdt_trc20'
        and v_payout_details !~ '^T[A-HJ-NP-Za-km-z1-9]{33}$' then
    raise exception 'Enter a valid USDT TRC-20 wallet address';
  elsif v_payout_changed
        and v_payout_method = 'usdt_erc20'
        and v_payout_details !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'Enter a valid USDT ERC-20 wallet address';
  elsif v_payout_changed
        and v_payout_method is not null
        and v_payout_method not in ('usdt_trc20', 'usdt_erc20') then
    raise exception 'Choose a supported payout network';
  end if;

  perform pg_advisory_xact_lock(hashtext(lower(v_slug::text)));
  if p_accepting_orders and not exists (
    select 1 from public.studios s
     where s.id = v_studio and s.status = 'active' and s.platform_commission_bps is not null
  ) then
    raise exception 'BuildEx must activate the studio and configure its commission first';
  end if;
  if p_accepting_orders and not exists (
    select 1 from public.studio_memberships m
     where m.studio_id = v_studio and m.status = 'active'
  ) then
    raise exception 'Invite at least one employee before accepting orders';
  end if;
  if exists (
    select 1 from public.studios s
     where lower(s.slug::text) = lower(v_slug::text) and s.id <> v_studio
  ) then raise exception 'That username is already taken'; end if;
  if exists (
    select 1 from public.profiles p
     where lower(p.username) = lower(v_slug::text) and p.id <> me
  ) then raise exception 'That username is already taken'; end if;

  update public.studios
     set name = btrim(p_name),
         slug = v_slug,
         logo_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         rates = coalesce(p_rates, '{}'::jsonb),
         employee_commission_bps = p_employee_commission_bps,
         accepting_orders = p_accepting_orders,
         payout_method = case
           when v_payout_changed then v_payout_method
           else payout_method
         end,
         payout_details = case
           when v_payout_changed then v_payout_details
           else payout_details
         end
   where id = v_studio;

  update public.profiles
     set display_name = btrim(p_name),
         username = v_slug::text,
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), '')
   where id = me;
end;
$$;

revoke all on function public.update_my_studio(
  text, text, text, jsonb, int, boolean, text, text
) from public;
grant execute on function public.update_my_studio(
  text, text, text, jsonb, int, boolean, text, text
) to authenticated;

notify pgrst, 'reload schema';
