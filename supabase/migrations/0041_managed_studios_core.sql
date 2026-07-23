-- =============================================================================
-- BuildEx — managed studio marketplace (core schema)
--
-- Replaces the unused 0026 referral/promo concept with real studio accounts.
-- Existing independent builders/orders remain valid. The old columns are kept
-- for migration safety but no longer participate in new order economics.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists citext;

-- ─── Moderator invitations ──────────────────────────────────────────────────

create table if not exists public.studio_moderator_invites (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null check (char_length(btrim(internal_name)) between 1 and 120),
  code citext not null unique check (char_length(btrim(code::text)) between 6 and 64),
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'revoked')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  claimed_by uuid references public.profiles(id) on delete set null,
  studio_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

alter table public.studio_moderator_invites enable row level security;

drop policy if exists "admins read studio moderator invites" on public.studio_moderator_invites;
create policy "admins read studio moderator invites"
  on public.studio_moderator_invites for select
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ));

-- ─── Convert studios into owned storefronts ─────────────────────────────────

alter table public.studios
  add column if not exists moderator_id uuid references public.profiles(id) on delete restrict,
  add column if not exists rates jsonb not null default '{}'::jsonb,
  add column if not exists platform_commission_bps int,
  add column if not exists employee_commission_bps int,
  add column if not exists accepting_orders boolean not null default false,
  add column if not exists available_employees int not null default 0,
  add column if not exists avg_rating numeric(3,2) not null default 0,
  add column if not exists reviews_count int not null default 0,
  add column if not exists completed_orders int not null default 0,
  add column if not exists payout_method text,
  add column if not exists payout_details text,
  add column if not exists claimed_at timestamptz;

create unique index if not exists studios_moderator_unique
  on public.studios (moderator_id) where moderator_id is not null;

alter table public.studio_moderator_invites
  drop constraint if exists studio_moderator_invites_studio_id_fkey;
alter table public.studio_moderator_invites
  add constraint studio_moderator_invites_studio_id_fkey
  foreign key (studio_id) references public.studios(id) on delete set null;

do $$
declare c text;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.studios'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.studios drop constraint %I', c);
  end loop;
end$$;

alter table public.studios
  add constraint studios_managed_status_check
    check (status in ('pending', 'active', 'suspended')),
  add constraint studios_platform_commission_check
    check (platform_commission_bps is null or platform_commission_bps between 0 and 10000),
  add constraint studios_employee_commission_check
    check (employee_commission_bps is null or employee_commission_bps between 0 and 10000),
  add constraint studios_payout_method_check
    check (payout_method is null or payout_method in ('usdt_trc20', 'usdt_erc20', 'sepa_eur'));

-- Rows created by the retired referral program are not storefronts. Keep them
-- for ledger/audit history, but never expose or activate them until an admin
-- deliberately recovers ownership through the managed-studio console.
update public.studios
   set status = 'suspended', accepting_orders = false
 where moderator_id is null;

-- Active storefronts are public. A moderator can see their own pending or
-- suspended studio; admins can see everything.
drop policy if exists "studios public read" on public.studios;
create policy "studios public read"
  on public.studios for select
  using (
    status = 'active'
    or moderator_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- All writes use RPCs. This also prevents a moderator from setting BuildEx's
-- platform commission through PostgREST.
revoke insert, update, delete on public.studios from anon, authenticated;

-- ─── Studio portfolio ───────────────────────────────────────────────────────

create table if not exists public.studio_portfolio_images (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  url text not null,
  storage_path text,
  position int not null default 0,
  alt text,
  created_at timestamptz not null default now()
);

create index if not exists studio_portfolio_images_studio_idx
  on public.studio_portfolio_images (studio_id, position);

alter table public.studio_portfolio_images enable row level security;

drop policy if exists "public reads active studio portfolio" on public.studio_portfolio_images;
create policy "public reads active studio portfolio"
  on public.studio_portfolio_images for select
  using (exists (
    select 1 from public.studios s
     where s.id = studio_id
       and (s.status = 'active' or s.moderator_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  ));

drop policy if exists "moderator manages studio portfolio" on public.studio_portfolio_images;
create policy "moderator manages studio portfolio"
  on public.studio_portfolio_images for all
  using (exists (
    select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid()
  ));

-- The existing public portfolios bucket stores files under the owning user's
-- UUID. Studio moderators remain the storage owner, while this table gives the
-- images studio ownership at the application layer.

-- ─── Employee code batches and memberships ──────────────────────────────────

create table if not exists public.studio_employee_codes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  code citext not null unique check (char_length(btrim(code::text)) between 6 and 64),
  max_redemptions int not null check (max_redemptions between 1 and 1000),
  redemptions_used int not null default 0 check (redemptions_used >= 0),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create index if not exists studio_employee_codes_studio_idx
  on public.studio_employee_codes (studio_id, created_at desc);

alter table public.studio_employee_codes enable row level security;

drop policy if exists "moderator reads employee codes" on public.studio_employee_codes;
create policy "moderator reads employee codes"
  on public.studio_employee_codes for select
  using (
    exists (select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create table if not exists public.studio_memberships (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  availability_status text not null default 'available'
    check (availability_status in ('available', 'busy')),
  busy_source text check (busy_source is null or busy_source in ('manual', 'order')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index if not exists studio_memberships_one_active_builder
  on public.studio_memberships (builder_id) where status = 'active';
create index if not exists studio_memberships_studio_idx
  on public.studio_memberships (studio_id, status, availability_status);

alter table public.studio_memberships enable row level security;

drop policy if exists "members and moderator read memberships" on public.studio_memberships;
create policy "members and moderator read memberships"
  on public.studio_memberships for select
  using (
    builder_id = auth.uid()
    or exists (select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Mark builder profiles so employees can be excluded from public discovery.
alter table public.builder_profiles
  add column if not exists profile_type text not null default 'independent',
  add column if not exists pending_employee_code citext;

-- Detach referral-era membership. Managed employment is represented only by
-- studio_memberships and is established through a new employee code.
update public.builder_profiles
   set studio_id = null,
       studio_promo_bps = null,
       studio_promo_ends_at = null
 where studio_id is not null;

alter table public.builder_profiles
  drop constraint if exists builder_profiles_profile_type_check;
alter table public.builder_profiles
  add constraint builder_profiles_profile_type_check
    check (profile_type in ('independent', 'studio_employee'));

-- ─── Orders and assignment history ──────────────────────────────────────────

alter table public.orders alter column builder_id drop not null;
alter table public.orders
  add column if not exists studio_id uuid references public.studios(id) on delete restrict,
  add column if not exists assigned_builder_id uuid references public.profiles(id) on delete restrict,
  add column if not exists platform_commission_bps_snapshot int,
  add column if not exists employee_commission_bps_snapshot int,
  add column if not exists studio_earnings_kopecks int,
  add column if not exists employee_owed_kopecks int;

-- In 0026-0040, studio_id was only an independent-builder referral snapshot.
-- Clear that obsolete association before enforcing exactly one real provider.
update public.orders set studio_id = null where builder_id is not null;

alter table public.orders drop constraint if exists orders_provider_exactly_one;
alter table public.orders
  add constraint orders_provider_exactly_one check (
    (builder_id is not null and studio_id is null)
    or (builder_id is null and studio_id is not null)
  ),
  add constraint orders_assignment_matches_provider check (
    (studio_id is not null) or assigned_builder_id is null
  ),
  add constraint orders_studio_money_nonnegative check (
    (studio_earnings_kopecks is null or studio_earnings_kopecks >= 0)
    and (employee_owed_kopecks is null or employee_owed_kopecks >= 0)
  );

create index if not exists orders_studio_idx
  on public.orders (studio_id, created_at desc) where studio_id is not null;
create index if not exists orders_assigned_builder_idx
  on public.orders (assigned_builder_id, created_at desc) where assigned_builder_id is not null;
create unique index if not exists orders_one_live_buyer_studio
  on public.orders (buyer_id, studio_id)
  where studio_id is not null
    and status in ('pending_payment', 'paid', 'in_progress', 'delivered', 'disputed');

create table if not exists public.studio_order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete restrict,
  employee_commission_bps int not null check (employee_commission_bps between 0 and 10000),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);

create unique index if not exists studio_order_assignments_one_current_order
  on public.studio_order_assignments (order_id) where released_at is null;
create unique index if not exists studio_order_assignments_one_current_builder
  on public.studio_order_assignments (builder_id) where released_at is null;
create index if not exists studio_order_assignments_builder_history
  on public.studio_order_assignments (builder_id, assigned_at desc);

alter table public.studio_order_assignments enable row level security;

drop policy if exists "assignment participants read" on public.studio_order_assignments;
create policy "assignment participants read"
  on public.studio_order_assignments for select
  using (
    builder_id = auth.uid()
    or exists (
      select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create table if not exists public.studio_employee_earnings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete restrict,
  commission_bps int not null check (commission_bps between 0 and 10000),
  amount_kopecks int not null check (amount_kopecks >= 0),
  created_at timestamptz not null default now()
);

create index if not exists studio_employee_earnings_builder_idx
  on public.studio_employee_earnings (builder_id, created_at desc);

alter table public.studio_employee_earnings enable row level security;

drop policy if exists "earnings participant read" on public.studio_employee_earnings;
create policy "earnings participant read"
  on public.studio_employee_earnings for select
  using (
    builder_id = auth.uid()
    or exists (select 1 from public.studios s where s.id = studio_id and s.moderator_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ─── Permanent buyer ↔ studio conversations ─────────────────────────────────

alter table public.conversations
  alter column user_a drop not null,
  alter column user_b drop not null;
alter table public.conversations
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists studio_id uuid references public.studios(id) on delete cascade,
  add column if not exists client_id uuid references public.profiles(id) on delete cascade;

alter table public.conversations drop constraint if exists conversations_shape_check;
alter table public.conversations
  add constraint conversations_shape_check check (
    (
      conversation_type = 'direct'
      and user_a is not null and user_b is not null
      and studio_id is null and client_id is null
    )
    or
    (
      conversation_type = 'studio_client'
      and user_a is null and user_b is null
      and studio_id is not null and client_id is not null
    )
  );

create unique index if not exists conversations_studio_client_unique
  on public.conversations (studio_id, client_id)
  where conversation_type = 'studio_client';

-- ─── Studio reviews and favorites ───────────────────────────────────────────

alter table public.reviews alter column builder_id drop not null;
alter table public.reviews
  add column if not exists studio_id uuid references public.studios(id) on delete cascade;
alter table public.reviews drop constraint if exists reviews_target_exactly_one;
alter table public.reviews
  add constraint reviews_target_exactly_one check (
    (builder_id is not null and studio_id is null)
    or (builder_id is null and studio_id is not null)
  );
create index if not exists reviews_studio_idx
  on public.reviews (studio_id, created_at desc) where studio_id is not null;

alter table public.favorites alter column builder_id drop not null;
alter table public.favorites
  add column if not exists studio_id uuid references public.studios(id) on delete cascade;
alter table public.favorites drop constraint if exists favorites_target_exactly_one;
alter table public.favorites
  add constraint favorites_target_exactly_one check (
    (builder_id is not null and studio_id is null)
    or (builder_id is null and studio_id is not null)
  );
create unique index if not exists favorites_user_studio_unique
  on public.favorites (user_id, studio_id) where studio_id is not null;

-- ─── Studio withdrawals ─────────────────────────────────────────────────────

alter table public.payouts alter column builder_id drop not null;
alter table public.payouts
  add column if not exists studio_id uuid references public.studios(id) on delete cascade;
alter table public.payouts drop constraint if exists payouts_owner_exactly_one;
alter table public.payouts
  add constraint payouts_owner_exactly_one check (
    (builder_id is not null and studio_id is null)
    or (builder_id is null and studio_id is not null)
  );
create index if not exists payouts_studio_status_idx
  on public.payouts (studio_id, status, created_at desc) where studio_id is not null;

drop policy if exists "participants read payouts" on public.payouts;
create policy "participants read payouts"
  on public.payouts for select
  using (
    builder_id = auth.uid()
    or exists (
      select 1 from public.studios s where s.id = payouts.studio_id and s.moderator_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ─── Column grants used by onboarding ───────────────────────────────────────

grant insert (
  id, tagline, pending_studio_code, pending_employee_code, profile_type,
  tools, project_types, response_time_hours, availability_status,
  is_available, specialties, build_types, rates
) on public.builder_profiles to authenticated;

grant update (
  id, tagline, pending_studio_code, pending_employee_code, profile_type,
  tools, project_types, response_time_hours, availability_status,
  is_available, specialties, build_types, rates
) on public.builder_profiles to authenticated;

-- Old referral entry points must not be usable by clients.
revoke execute on function public.redeem_studio_code(text) from public, anon, authenticated;
revoke execute on function public.validate_studio_code(text) from public, anon, authenticated;
revoke execute on function public.finalize_studio_code() from public, anon, authenticated;
revoke execute on function public.admin_create_studio(text, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.admin_update_studio(uuid, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.admin_set_studio_status(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_create_studio_code(uuid, text, int, timestamptz) from public, anon, authenticated;
revoke execute on function public.admin_mark_override_paid(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
