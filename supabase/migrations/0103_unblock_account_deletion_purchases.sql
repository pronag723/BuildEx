-- ─────────────────────────────────────────────────────────────────────────────
-- 0103 — Let accounts with ready-build purchases be deleted
--
-- Symptom: deleting an account from /account fails with
--   update or delete on table "profiles" violates foreign key constraint
--   "ready_build_purchases_buyer_id_fkey" on table "ready_build_purchases"
--
-- Cause: 0075 created ready_build_purchases with ON DELETE RESTRICT on all four
-- of its links — buyer_id, builder_id, listing_id and version_id.
-- delete_own_account() deletes the auth user, auth.users cascades to profiles,
-- and RESTRICT refuses the profile delete while any purchase points at it:
--   • the buyer is blocked directly by buyer_id;
--   • the seller is blocked by builder_id, and one step later by listing_id /
--     version_id, because profiles cascades to ready_builds and its versions.
-- The ready-build marketplace is gone (0095), so nothing will ever settle or
-- remove these rows — every account that ever touched one was stuck for good.
--
-- Fix: ON DELETE SET NULL, not CASCADE. Purchase rows are retained money
-- records under the decommission-never-delete rule (0095). SET NULL keeps the
-- row — price, commission, earnings, status, paid_at, and the title and file
-- snapshots taken at purchase time — and only drops the link to the account
-- that left. A NULL buyer/seller/listing now reads "deleted".
--
-- 0090's exactly_one_seller check would reject a seller set to NULL (a builder
-- sale has studio_id NULL too), so it becomes at_most_one_seller: still never
-- two sellers, and no seller means the seller deleted their account.
--
-- No rows are deleted or rewritten by this file. Idempotent: the FKs are found
-- by column in the catalog, dropped and re-added under their default names.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  fk record;
begin
  -- Resolved from the catalog rather than by name, so a constraint created
  -- under a different name in some environment cannot survive as a second,
  -- still-RESTRICT foreign key next to the new one.
  for fk in
    select distinct c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = 'public.ready_build_purchases'::regclass
       and c.contype = 'f'
       and a.attname in ('buyer_id', 'builder_id', 'listing_id', 'version_id')
  loop
    execute format('alter table public.ready_build_purchases drop constraint %I', fk.conname);
  end loop;
end $$;

-- builder_id has been nullable since 0090.
alter table public.ready_build_purchases
  alter column buyer_id drop not null,
  alter column listing_id drop not null,
  alter column version_id drop not null;

alter table public.ready_build_purchases
  add constraint ready_build_purchases_buyer_id_fkey
    foreign key (buyer_id) references public.profiles(id) on delete set null,
  add constraint ready_build_purchases_builder_id_fkey
    foreign key (builder_id) references public.profiles(id) on delete set null,
  add constraint ready_build_purchases_listing_id_fkey
    foreign key (listing_id) references public.ready_builds(id) on delete set null,
  add constraint ready_build_purchases_version_id_fkey
    foreign key (version_id) references public.ready_build_versions(id) on delete set null;

alter table public.ready_build_purchases drop constraint if exists ready_build_purchases_exactly_one_seller;
alter table public.ready_build_purchases drop constraint if exists ready_build_purchases_at_most_one_seller;
alter table public.ready_build_purchases add constraint ready_build_purchases_at_most_one_seller
  check (builder_id is null or studio_id is null);

notify pgrst, 'reload schema';
