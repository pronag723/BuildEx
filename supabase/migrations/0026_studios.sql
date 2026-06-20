-- =============================================================================
-- BuildEx — Studio partner / referral program ("BuildEx Studios")
--
-- Studios (Minecraft build teams we recruit off Discord) are onboarded as
-- permanent revenue-sharing storefronts. We mint a capped promo CODE; a builder
-- redeems it during onboarding and gets:
--   • a flat reduced commission for their first 4 months (acquisition hook), and
--   • a studio badge before their nickname (free brand exposure for the studio).
-- The studio earns a permanent OVERRIDE = a share of OUR commission on every
-- order its builders complete. The override is carved from platform income only
-- — builder earnings are never touched — so it can never push our margin
-- negative (see lib/ranks.js and the plan for the full economics).
--
-- This migration also RAISES the standard rank schedule so margin survives the
-- Cryptomus processing cost + the studio cut on every tier:
--   rookie 18 % · advanced 15 % · expert 12 % · master 9 %   (was 15/12/8/5)
-- Mirrored in lib/ranks.js — keep the two in sync.
--
-- New objects:
--   • studios / studio_codes / studio_overrides tables (+ RLS)
--   • builder_profiles.studio_id / studio_promo_bps / studio_promo_ends_at
--   • orders.studio_id / commission_is_promo
--   • commission_bps_for_rank(text)        — REDEFINED with the raised schedule
--   • redeem_studio_code(text)             — atomic, capped, one studio / builder
--   • _accrue_studio_override(uuid)        — internal: ledger a completed order
--   • place_order(...)                     — REDEFINED: promo rate + studio snapshot
--   • buyer_confirm_complete(uuid)         — REDEFINED: accrue override on complete
--   • resolve_dispute(uuid,text,text)      — REDEFINED: accrue on release, claw back on refund
--   • admin_* RPCs                         — is_admin-gated studio/code/ledger mgmt
--
-- Idempotent — safe to re-run during development.
-- =============================================================================

create extension if not exists citext;

-- ─── 1. Raised standard commission schedule ─────────────────────────────────
-- Redefinition of the 0014 version. Same shape; only the numbers change.
create or replace function public.commission_bps_for_rank(p_rank text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_rank
    when 'master'   then 900
    when 'expert'   then 1200
    when 'advanced' then 1500
    else 1800  -- rookie, and any unknown value, fall back to the highest rate
  end;
$$;

-- ─── 2. studios ─────────────────────────────────────────────────────────────
create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  logo_url text,
  bio text check (bio is null or char_length(bio) <= 2000),
  -- Studio's share of OUR commission, in basis points (4000 = 40 %).
  studio_share_bps int not null default 4000 check (studio_share_bps between 0 and 10000),
  -- Flat promo commission a referred builder pays for their first 4 months.
  promo_bps int not null default 1100 check (promo_bps between 0 and 10000),
  status text not null default 'active' check (status in ('active', 'suspended')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 3. studio_codes (capped, admin-minted, multi-use) ──────────────────────
create table if not exists public.studio_codes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  code citext not null unique check (char_length(btrim(code)) between 3 and 40),
  max_redemptions int not null default 25 check (max_redemptions > 0),
  redemptions_used int not null default 0 check (redemptions_used >= 0),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create index if not exists studio_codes_studio_idx on public.studio_codes (studio_id);

-- ─── 4. studio_overrides (ledger — one row per completed referred order) ─────
create table if not exists public.studio_overrides (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'accrued' check (status in ('accrued', 'paid', 'clawed_back')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists studio_overrides_studio_idx on public.studio_overrides (studio_id, status);

-- ─── 5. New columns on builder_profiles + orders ────────────────────────────
alter table public.builder_profiles
  add column if not exists studio_id uuid references public.studios(id) on delete set null,
  add column if not exists studio_promo_bps int,
  add column if not exists studio_promo_ends_at timestamptz;

alter table public.orders
  add column if not exists studio_id uuid references public.studios(id) on delete set null,
  add column if not exists commission_is_promo boolean not null default false;

-- updated_at touch for studios
drop trigger if exists studios_touch_updated_at on public.studios;
create trigger studios_touch_updated_at
  before update on public.studios
  for each row execute function public.touch_order_updated_at();

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
alter table public.studios enable row level security;
alter table public.studio_codes enable row level security;
alter table public.studio_overrides enable row level security;

-- Active studios are public (storefront + badge); admins also see suspended.
drop policy if exists "studios public read" on public.studios;
create policy "studios public read"
  on public.studios for select
  using (
    status = 'active'
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Codes are sensitive (anyone with one can redeem); admin-only read. Writes via RPC.
drop policy if exists "studio codes admin read" on public.studio_codes;
create policy "studio codes admin read"
  on public.studio_codes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Override ledger is admin-only (studios aren't user accounts in this phase).
drop policy if exists "studio overrides admin read" on public.studio_overrides;
create policy "studio overrides admin read"
  on public.studio_overrides for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- No INSERT/UPDATE/DELETE policies on any of the three — all writes go through
-- the SECURITY DEFINER RPCs below.

-- ─── 7. redeem_studio_code ──────────────────────────────────────────────────
-- Called from onboarding. Atomic + capped; one studio per builder, ever.
create or replace function public.redeem_studio_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code citext := btrim(coalesce(p_code, ''));
  v_code_id uuid;
  v_studio_id uuid;
  v_promo_bps int;
  v_existing_studio uuid;
  v_ends timestamptz := now() + interval '4 months';
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(v_code) = 0 then
    raise exception 'A studio code is required';
  end if;

  -- The builder profile must exist first (created earlier in onboarding).
  select studio_id into v_existing_studio
    from public.builder_profiles where id = me;
  if not found then
    raise exception 'Create your builder profile before redeeming a code';
  end if;
  if v_existing_studio is not null then
    raise exception 'You have already joined a studio';
  end if;

  -- Find + lock the code (case-insensitive via citext); studio must be active.
  select c.id, c.studio_id, s.promo_bps
    into v_code_id, v_studio_id, v_promo_bps
    from public.studio_codes c
    join public.studios s on s.id = c.studio_id
   where c.code = v_code
     and c.status = 'active'
     and s.status = 'active'
     and (c.expires_at is null or c.expires_at > now())
   for update of c;

  if v_code_id is null then
    raise exception 'That code is invalid or expired';
  end if;

  -- Atomic cap: only succeeds while there is room left.
  update public.studio_codes
     set redemptions_used = redemptions_used + 1
   where id = v_code_id
     and redemptions_used < max_redemptions;
  if not found then
    raise exception 'This code has reached its redemption limit';
  end if;

  update public.builder_profiles
     set studio_id = v_studio_id,
         studio_promo_bps = v_promo_bps,
         studio_promo_ends_at = v_ends
   where id = me;

  return (
    select jsonb_build_object(
      'studio_id', s.id,
      'name', s.name,
      'slug', s.slug::text,
      'logo_url', s.logo_url,
      'promo_bps', v_promo_bps,
      'promo_ends_at', v_ends
    )
    from public.studios s where s.id = v_studio_id
  );
end;
$$;

revoke all on function public.redeem_studio_code(text) from public;
grant execute on function public.redeem_studio_code(text) to authenticated;

-- ─── 8. _accrue_studio_override — ledger a completed referred order ──────────
-- Internal (not granted to clients). Idempotent via studio_overrides.order_id
-- UNIQUE. Override = round(commission * studio_share_bps / 10000), recorded only
-- when the order was attributed to an ACTIVE studio. Builder earnings untouched.
create or replace function public._accrue_studio_override(p_order uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_builder uuid;
  v_commission int;
  v_share int;
  v_status text;
  v_amount int;
begin
  select o.studio_id, o.builder_id, o.commission_kopecks
    into v_studio_id, v_builder, v_commission
    from public.orders o
   where o.id = p_order;

  if v_studio_id is null then
    return;  -- not a studio-referred order
  end if;

  -- Already ledgered? (idempotent re-entry / double completion guard.)
  if exists (select 1 from public.studio_overrides where order_id = p_order) then
    return;
  end if;

  select status, studio_share_bps into v_status, v_share
    from public.studios where id = v_studio_id;
  if v_status is distinct from 'active' then
    return;  -- suspended studios stop accruing
  end if;

  v_amount := round((coalesce(v_commission, 0)::numeric * coalesce(v_share, 0)) / 10000)::int;

  insert into public.studio_overrides (order_id, studio_id, builder_id, amount_cents, status)
  values (p_order, v_studio_id, v_builder, v_amount, 'accrued');
end;
$$;

revoke all on function public._accrue_studio_override(uuid) from public;

-- ─── 9. place_order — promo rate + studio snapshot ──────────────────────────
-- Redefinition of the 0020 version. Adds: read the builder's studio link; use
-- the flat promo rate while the 4-month window is open, else the rank rate;
-- snapshot studio_id + commission_is_promo so completion knows whether/where to
-- accrue the override. Everything else (price/label/style validation) preserved.
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
  v_studio_id uuid;
  v_promo_bps int;
  v_promo_ends timestamptz;
  v_is_promo boolean := false;
  v_price int;
  v_commission int;
  v_earnings int;
  v_commission_bps int;
  v_label text;
  v_order_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if p_builder is null or p_builder = me then
    raise exception 'Invalid builder';
  end if;
  if p_size is null or char_length(btrim(p_size)) = 0 then
    raise exception 'Invalid size';
  end if;
  if p_style is null or char_length(btrim(p_style)) = 0 then
    raise exception 'Style is required';
  end if;
  if p_brief is null or char_length(btrim(p_brief)) = 0 then
    raise exception 'Brief is required';
  end if;

  select rates, specialties, rank, studio_id, studio_promo_bps, studio_promo_ends_at
    into v_rates, v_specialties, v_rank, v_studio_id, v_promo_bps, v_promo_ends
    from public.builder_profiles
   where id = p_builder;

  if v_rates is null then
    raise exception 'Builder not found';
  end if;

  v_tier := v_rates -> p_size;
  if v_tier is null
     or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Builder does not offer this size';
  end if;

  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price <= 0 then
    raise exception 'Builder has not set a price for this size';
  end if;

  if v_specialties is null or not (p_style = any(v_specialties)) then
    raise exception 'Style not offered by builder';
  end if;

  v_label := nullif(btrim(coalesce(v_tier ->> 'label', '')), '');

  -- Effective commission: flat promo rate during the 4-month window, else rank.
  if v_promo_ends is not null and v_promo_ends > now() and v_promo_bps is not null then
    v_commission_bps := v_promo_bps;
    v_is_promo := true;
  else
    v_commission_bps := public.commission_bps_for_rank(coalesce(v_rank, 'rookie'));
  end if;
  v_commission := (v_price * v_commission_bps) / 10000;
  v_earnings := v_price - v_commission;

  insert into public.orders (
    buyer_id, builder_id, building_size, size_label, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks,
    studio_id, commission_is_promo, status
  )
  values (
    me, p_builder, p_size, v_label, p_style, p_brief,
    v_price, v_commission, v_earnings,
    v_studio_id, v_is_promo, 'pending_payment'
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text) to authenticated;

-- ─── 10. buyer_confirm_complete — accrue override on completion ──────────────
-- Redefinition of the 0014 version. Adds the _accrue_studio_override call after
-- the rank recompute. Status transition / chat event / stats refresh preserved.
create or replace function public.buyer_confirm_complete(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_builder uuid;
  v_status public.order_status;
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select buyer_id, builder_id, status into v_buyer, v_builder, v_status
    from public.orders where id = p_order for update;

  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer <> me then raise exception 'Only the buyer can confirm'; end if;
  if v_status <> 'delivered' then raise exception 'Order is not awaiting confirmation'; end if;

  update public.orders
     set status = 'completed',
         completed_at = now()
   where id = p_order;

  v_conv := public._ensure_order_conversation(p_order);
  perform public._post_order_event(
    p_order, v_conv, 'completed',
    'Buyer confirmed the delivery — order completed.',
    '{}'::jsonb
  );

  perform public.recompute_builder_review_stats(v_builder);
  perform public.recompute_builder_rank(v_builder);
  -- Studios: ledger the studio's permanent override on this completed order.
  perform public._accrue_studio_override(p_order);
end;
$$;

revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

-- ─── 11. resolve_dispute — accrue on release, claw back on refund ────────────
-- Redefinition of the 0015 version. A 'release' is a completion, so it accrues
-- the override exactly like buyer_confirm_complete. A 'refund' cancels the order;
-- defensively claw back any override already ledgered for it.
create or replace function public.resolve_dispute(
  p_order uuid,
  p_outcome text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_is_admin boolean;
  v_builder uuid;
  v_status public.order_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_conv uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select is_admin into v_is_admin from public.profiles where id = me;
  if v_is_admin is not true then
    raise exception 'Only an admin can resolve disputes';
  end if;
  if p_outcome not in ('release', 'refund') then
    raise exception 'Outcome must be release or refund';
  end if;

  select builder_id, status into v_builder, v_status
    from public.orders where id = p_order for update;

  if v_builder is null then
    raise exception 'Order not found';
  end if;
  if v_status <> 'disputed' then
    raise exception 'Order is not under dispute';
  end if;
  if not exists (
    select 1 from public.disputes where order_id = p_order and status = 'open'
  ) then
    raise exception 'No open dispute for this order';
  end if;

  v_conv := public._ensure_order_conversation(p_order);

  if p_outcome = 'release' then
    update public.orders
       set status = 'completed',
           completed_at = now()
     where id = p_order;

    update public.disputes
       set status = 'resolved_release',
           resolution_note = v_note,
           resolved_by = me,
           resolved_at = now()
     where order_id = p_order;

    perform public._post_order_event(
      p_order, v_conv, 'dispute_released',
      'Dispute resolved — released to the builder. Order completed.',
      '{}'::jsonb
    );

    perform public.recompute_builder_review_stats(v_builder);
    perform public.recompute_builder_rank(v_builder);
    -- A released dispute is still a completion → accrue the studio override.
    perform public._accrue_studio_override(p_order);
  else
    update public.orders
       set status = 'cancelled',
           cancelled_at = now()
     where id = p_order;

    update public.disputes
       set status = 'resolved_refund',
           resolution_note = v_note,
           resolved_by = me,
           resolved_at = now()
     where order_id = p_order;

    perform public._post_order_event(
      p_order, v_conv, 'dispute_refunded',
      'Dispute resolved — refunded to the buyer. Order cancelled.',
      '{}'::jsonb
    );

    -- Refunded: undo any override accrued for this order (normally none).
    update public.studio_overrides
       set status = 'clawed_back'
     where order_id = p_order
       and status = 'accrued';
  end if;
end;
$$;

revoke all on function public.resolve_dispute(uuid, text, text) from public;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- ─── 12. Admin RPCs (is_admin gated, SECURITY DEFINER) ──────────────────────
create or replace function public._require_admin()
returns void
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Admin only';
  end if;
end;
$$;
revoke all on function public._require_admin() from public;

create or replace function public.admin_create_studio(
  p_name text,
  p_slug text,
  p_logo_url text default null,
  p_bio text default null,
  p_share_bps int default 4000,
  p_promo_bps int default 1100
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require_admin();
  insert into public.studios (name, slug, logo_url, bio, studio_share_bps, promo_bps)
  values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(coalesce(p_logo_url,'')),''),
          nullif(btrim(coalesce(p_bio,'')),''), p_share_bps, p_promo_bps)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_studio(text, text, text, text, int, int) from public;
grant execute on function public.admin_create_studio(text, text, text, text, int, int) to authenticated;

create or replace function public.admin_update_studio(
  p_id uuid,
  p_name text,
  p_logo_url text,
  p_bio text,
  p_share_bps int,
  p_promo_bps int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.studios
     set name = btrim(p_name),
         logo_url = nullif(btrim(coalesce(p_logo_url,'')),''),
         bio = nullif(btrim(coalesce(p_bio,'')),''),
         studio_share_bps = p_share_bps,
         promo_bps = p_promo_bps
   where id = p_id;
end;
$$;
revoke all on function public.admin_update_studio(uuid, text, text, text, int, int) from public;
grant execute on function public.admin_update_studio(uuid, text, text, text, int, int) to authenticated;

create or replace function public.admin_set_studio_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status not in ('active', 'suspended') then
    raise exception 'Status must be active or suspended';
  end if;
  update public.studios set status = p_status where id = p_id;
end;
$$;
revoke all on function public.admin_set_studio_status(uuid, text) from public;
grant execute on function public.admin_set_studio_status(uuid, text) to authenticated;

create or replace function public.admin_create_studio_code(
  p_studio uuid,
  p_code text,
  p_max_redemptions int default 25,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._require_admin();
  insert into public.studio_codes (studio_id, code, max_redemptions, expires_at)
  values (p_studio, btrim(p_code), p_max_redemptions, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_studio_code(uuid, text, int, timestamptz) from public;
grant execute on function public.admin_create_studio_code(uuid, text, int, timestamptz) to authenticated;

create or replace function public.admin_set_code_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status not in ('active', 'disabled') then
    raise exception 'Status must be active or disabled';
  end if;
  update public.studio_codes set status = p_status where id = p_id;
end;
$$;
revoke all on function public.admin_set_code_status(uuid, text) from public;
grant execute on function public.admin_set_code_status(uuid, text) to authenticated;

create or replace function public.admin_mark_override_paid(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.studio_overrides
     set status = 'paid', paid_at = now()
   where id = p_id and status = 'accrued';
end;
$$;
revoke all on function public.admin_mark_override_paid(uuid) from public;
grant execute on function public.admin_mark_override_paid(uuid) to authenticated;

-- Force PostgREST to reload its schema cache so the new/redefined RPCs are
-- immediately callable (same pattern as the other migrations).
notify pgrst, 'reload schema';
