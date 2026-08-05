-- Studio-owned ready builds, employee self-service departure, safe studio
-- deletion, and the moderator commission range requested for BuildEx.

-- Managed-studio commission is intentionally configurable from 0% to 100%.
alter table public.studios drop constraint if exists studios_platform_commission_check;
alter table public.studios add constraint studios_platform_commission_check
  check (platform_commission_bps is null or platform_commission_bps between 0 and 10000);

create or replace function public.admin_configure_managed_studio(
  p_studio uuid, p_platform_commission_bps int, p_status text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_buildex_admin();
  if p_platform_commission_bps not between 0 and 10000 then
    raise exception 'Commission must be between 0 and 100 percent';
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

-- Exactly one seller owns every listing. Existing listings remain builder-owned.
alter table public.ready_builds add column if not exists studio_id uuid references public.studios(id) on delete restrict;
alter table public.ready_builds alter column builder_id drop not null;
alter table public.ready_builds drop constraint if exists ready_builds_exactly_one_seller;
alter table public.ready_builds add constraint ready_builds_exactly_one_seller check (
  (builder_id is not null and studio_id is null) or
  (builder_id is null and studio_id is not null)
);
create index if not exists ready_builds_studio_idx on public.ready_builds(studio_id, created_at desc)
  where studio_id is not null;

alter table public.ready_build_purchases add column if not exists studio_id uuid references public.studios(id) on delete restrict;
alter table public.ready_build_purchases add column if not exists seller_earnings_kopecks int;
update public.ready_build_purchases
   set seller_earnings_kopecks = builder_earnings_kopecks
 where seller_earnings_kopecks is null;
alter table public.ready_build_purchases alter column seller_earnings_kopecks set not null;
alter table public.ready_build_purchases add constraint ready_build_purchases_seller_earnings_check
  check (seller_earnings_kopecks >= 0);
alter table public.ready_build_purchases alter column builder_id drop not null;
alter table public.ready_build_purchases drop constraint if exists ready_build_purchases_exactly_one_seller;
alter table public.ready_build_purchases add constraint ready_build_purchases_exactly_one_seller check (
  (builder_id is not null and studio_id is null) or
  (builder_id is null and studio_id is not null)
);
create index if not exists ready_build_purchases_studio_idx
  on public.ready_build_purchases(studio_id, created_at desc) where studio_id is not null;

alter table public.ready_build_payouts add column if not exists studio_id uuid references public.studios(id) on delete cascade;
alter table public.ready_build_payouts alter column builder_id drop not null;
alter table public.ready_build_payouts drop constraint if exists ready_build_payouts_exactly_one_seller;
alter table public.ready_build_payouts add constraint ready_build_payouts_exactly_one_seller check (
  (builder_id is not null and studio_id is null) or
  (builder_id is null and studio_id is not null)
);
create index if not exists ready_build_payouts_studio_idx
  on public.ready_build_payouts(studio_id, created_at desc) where studio_id is not null;

create or replace function public.can_manage_ready_build(p_listing_id text)
returns boolean language sql stable security definer set search_path = public set row_security = off as $$
  select auth.uid() is not null and exists (
    select 1 from public.ready_builds l
    left join public.studios s on s.id = l.studio_id
    where l.id::text = p_listing_id
      and (l.builder_id = auth.uid() or s.moderator_id = auth.uid())
  );
$$;
alter function public.can_manage_ready_build(text) owner to postgres;
revoke all on function public.can_manage_ready_build(text) from public;
grant execute on function public.can_manage_ready_build(text) to authenticated;
grant execute on function public.can_manage_ready_build(text) to anon;

drop function if exists public.create_ready_build(text, text, text, int);
create function public.create_ready_build(
  p_title text, p_description text, p_style text, p_price_kopecks int,
  p_owner_type text
)
returns uuid language plpgsql security definer set search_path = public set row_security = off as $$
declare v_id uuid; v_studio uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_owner_type = 'studio' then
    select id into v_studio from public.studios
     where moderator_id = auth.uid() and status = 'active' and platform_commission_bps is not null;
    if v_studio is null then raise exception 'An active configured studio is required'; end if;
    insert into public.ready_builds(studio_id,title,description,style,price_kopecks)
    values(v_studio,btrim(p_title),btrim(p_description),lower(btrim(p_style)),p_price_kopecks)
    returning id into v_id;
  elsif p_owner_type = 'builder' and public.is_independent_builder(auth.uid()) then
    insert into public.ready_builds(builder_id,title,description,style,price_kopecks)
    values(auth.uid(),btrim(p_title),btrim(p_description),lower(btrim(p_style)),p_price_kopecks)
    returning id into v_id;
  else
    raise exception 'Only independent builders and studio moderators can publish ready-made builds';
  end if;
  return v_id;
end;
$$;
alter function public.create_ready_build(text,text,text,int,text) owner to postgres;
revoke all on function public.create_ready_build(text,text,text,int,text) from public;
grant execute on function public.create_ready_build(text,text,text,int,text) to authenticated;

create or replace function public.update_ready_build(
  p_listing uuid, p_title text, p_description text, p_style text,
  p_price_kopecks int, p_active boolean
)
returns void language plpgsql security definer set search_path = public set row_security = off as $$
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  update public.ready_builds set title=btrim(p_title), description=btrim(p_description),
    style=lower(btrim(p_style)), price_kopecks=p_price_kopecks, is_active=false, updated_at=now()
  where id=p_listing;
  if p_active then
    if not exists(select 1 from public.ready_build_versions where id=(select current_version_id from public.ready_builds where id=p_listing))
       or not exists(select 1 from public.ready_build_media where listing_id=p_listing) then
      raise exception 'Add photos and a world preview before publishing';
    end if;
    update public.ready_builds set is_active=true, updated_at=now() where id=p_listing;
  end if;
end;
$$;

create or replace function public.attach_ready_build_version(
  p_listing uuid, p_world_path text, p_file_name text, p_size bigint,
  p_preview_path text, p_preview_meta jsonb
)
returns uuid language plpgsql security definer set search_path = public set row_security = off as $$
declare v_id uuid;
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  if lower(right(btrim(p_file_name),4)) <> '.zip' then raise exception 'Ready-made worlds must be ZIP files'; end if;
  if p_world_path not like p_listing::text || '/%' or p_preview_path not like p_listing::text || '/%' then
    raise exception 'Invalid listing asset path';
  end if;
  insert into public.ready_build_versions(listing_id,world_path,world_file_name,world_size_bytes,preview_path,preview_meta)
  values(p_listing,p_world_path,btrim(p_file_name),p_size,p_preview_path,coalesce(p_preview_meta,'{}'::jsonb))
  returning id into v_id;
  update public.ready_builds set current_version_id=v_id,updated_at=now() where id=p_listing;
  return v_id;
end;
$$;

create or replace function public.attach_ready_build_media(
  p_listing uuid, p_storage_path text, p_url text, p_alt text, p_position int
)
returns uuid language plpgsql security definer set search_path = public set row_security = off as $$
declare v_id uuid;
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  if p_storage_path !~ ('^' || p_listing::text || '/[^/]+$') then raise exception 'Invalid listing image path'; end if;
  if coalesce(btrim(p_url),'')='' or p_position < 0 then raise exception 'Invalid listing image'; end if;
  insert into public.ready_build_media(listing_id,storage_path,url,alt,position)
  values(p_listing,p_storage_path,btrim(p_url),nullif(btrim(p_alt),''),p_position) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.reorder_ready_build_media(p_listing uuid, p_media_ids uuid[])
returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare v_offset int;
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  if cardinality(p_media_ids) <> (select count(*) from public.ready_build_media where listing_id=p_listing)
     or cardinality(p_media_ids) <> (select count(distinct media_id) from unnest(p_media_ids) as ids(media_id)) then
    raise exception 'Include every listing image exactly once';
  end if;
  select coalesce(max(position),0) + cardinality(p_media_ids) + 1 into v_offset
    from public.ready_build_media where listing_id=p_listing;
  update public.ready_build_media set position=position+v_offset where listing_id=p_listing;
  update public.ready_build_media m set position = ordered.position
    from (select media_id as id, ordinality::int - 1 position from unnest(p_media_ids) with ordinality as ids(media_id, ordinality)) ordered
   where m.id=ordered.id and m.listing_id=p_listing;
end;
$$;

create or replace function public.create_ready_build_purchase(p_listing uuid)
returns uuid language plpgsql security definer set search_path = public set row_security = off as $$
declare v_listing public.ready_builds; v_version public.ready_build_versions;
  v_bps int; v_commission int; v_purchase uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to buy this build'; end if;
  select * into v_listing from public.ready_builds where id=p_listing and is_active for share;
  if v_listing.id is null then raise exception 'This build is no longer for sale'; end if;
  if auth.uid()=v_listing.builder_id or exists(select 1 from public.studios where id=v_listing.studio_id and moderator_id=auth.uid()) then
    raise exception 'You cannot buy your own build';
  end if;
  select * into v_version from public.ready_build_versions where id=v_listing.current_version_id;
  if v_version.id is null then raise exception 'This listing is unavailable'; end if;
  if v_listing.studio_id is not null then
    select platform_commission_bps into v_bps from public.studios where id=v_listing.studio_id and status='active';
  else
    select public.commission_bps_for_rank(coalesce(rank,'rookie')) into v_bps
      from public.builder_profiles where id=v_listing.builder_id;
  end if;
  if v_bps is null then raise exception 'Seller commission is not configured'; end if;
  v_commission := (v_listing.price_kopecks*v_bps)/10000;
  insert into public.ready_build_purchases(
    listing_id,version_id,buyer_id,builder_id,studio_id,title_snapshot,price_kopecks,
    commission_kopecks,builder_earnings_kopecks,seller_earnings_kopecks,
    world_path_snapshot,world_file_name_snapshot
  ) values(
    p_listing,v_version.id,auth.uid(),v_listing.builder_id,v_listing.studio_id,v_listing.title,
    v_listing.price_kopecks,v_commission,v_listing.price_kopecks-v_commission,
    v_listing.price_kopecks-v_commission,v_version.world_path,v_version.world_file_name
  ) returning id into v_purchase;
  return v_purchase;
end;
$$;

create or replace function public.mark_ready_build_purchase_paid_internal(
  p_purchase uuid, p_invoice text, p_amount int, p_raw jsonb
)
returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare v public.ready_build_purchases; v_has_destination boolean;
begin
  select * into v from public.ready_build_purchases where id=p_purchase for update;
  if v.id is null then raise exception 'Purchase not found'; end if;
  if p_amount<>v.price_kopecks then raise exception 'Payment amount does not match purchase'; end if;
  insert into public.ready_build_payments(purchase_id,invoice_id,amount_cents,status,raw)
  values(p_purchase,p_invoice,p_amount,'paid',p_raw)
  on conflict(purchase_id) do update set invoice_id=coalesce(excluded.invoice_id,ready_build_payments.invoice_id),
    status='paid',raw=excluded.raw,updated_at=now();
  if v.status='paid' then return; end if;
  update public.ready_build_purchases set status='paid',paid_at=now() where id=p_purchase;
  if v.studio_id is not null then
    select nullif(btrim(coalesce(payout_details,'')),'') is not null into v_has_destination from public.studios where id=v.studio_id;
  else
    select nullif(btrim(coalesce(payout_details,'')),'') is not null into v_has_destination from public.builder_profiles where id=v.builder_id;
  end if;
  insert into public.ready_build_payouts(purchase_id,builder_id,studio_id,amount_cents,status)
  values(p_purchase,v.builder_id,v.studio_id,v.seller_earnings_kopecks,case when v_has_destination then 'pending' else 'blocked' end)
  on conflict(purchase_id) do nothing;
end;
$$;

create or replace function public.prepare_ready_build_delete(p_listing uuid)
returns table(image_paths text[],world_paths text[],preview_paths text[])
language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  if exists(select 1 from public.ready_build_purchases where listing_id=p_listing) then
    raise exception 'Builds with purchase history cannot be deleted; unlist this build instead';
  end if;
  update public.ready_builds set is_active=false,updated_at=now() where id=p_listing;
  return query select
    coalesce((select array_agg(storage_path) from public.ready_build_media where listing_id=p_listing),array[]::text[]),
    coalesce((select array_agg(world_path) from public.ready_build_versions where listing_id=p_listing),array[]::text[]),
    coalesce((select array_agg(preview_path) from public.ready_build_versions where listing_id=p_listing),array[]::text[]);
end;
$$;
create or replace function public.delete_ready_build(p_listing uuid)
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if not public.can_manage_ready_build(p_listing::text) then raise exception 'Listing not found'; end if;
  if exists(select 1 from public.ready_build_purchases where listing_id=p_listing) then
    raise exception 'Builds with purchase history cannot be deleted; unlist this build instead';
  end if;
  delete from public.ready_builds where id=p_listing;
end;
$$;

-- Rebuild read policies around the normalized seller check.
drop policy if exists "public active ready builds" on public.ready_builds;
create policy "public active ready builds" on public.ready_builds for select using (
  is_active or public.can_manage_ready_build(id::text)
);
drop policy if exists "buyers read purchases" on public.ready_build_purchases;
create policy "buyers read purchases" on public.ready_build_purchases for select using (
  buyer_id=auth.uid() or builder_id=auth.uid() or exists(
    select 1 from public.studios s where s.id=studio_id and s.moderator_id=auth.uid()
  )
);
drop policy if exists "public ready build versions" on public.ready_build_versions;
create policy "public ready build versions" on public.ready_build_versions for select using (
  exists(select 1 from public.ready_builds l where l.id=listing_id and (l.is_active or public.can_manage_ready_build(l.id::text)))
);
drop policy if exists "public ready build media" on public.ready_build_media;
create policy "public ready build media" on public.ready_build_media for select using (
  exists(select 1 from public.ready_builds l where l.id=listing_id and (l.is_active or public.can_manage_ready_build(l.id::text)))
);
drop policy if exists "participants read ready payments" on public.ready_build_payments;
create policy "participants read ready payments" on public.ready_build_payments for select using (
  exists(select 1 from public.ready_build_purchases p where p.id=purchase_id and (
    p.buyer_id=auth.uid() or p.builder_id=auth.uid() or exists(
      select 1 from public.studios s where s.id=p.studio_id and s.moderator_id=auth.uid()
    )
  ))
);
drop policy if exists "builders read ready payouts" on public.ready_build_payouts;
create policy "sellers read ready payouts" on public.ready_build_payouts for select using (
  builder_id=auth.uid() or exists(select 1 from public.studios s where s.id=studio_id and s.moderator_id=auth.uid())
);

-- Employee self-service departure. Busy/private is the safe independent default.
create or replace function public.get_my_studio_leave_eligibility()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
  select jsonb_build_object(
    'has_membership', exists(select 1 from public.studio_memberships where builder_id=auth.uid() and status='active'),
    'blocking_order_count', count(*),
    'can_leave', count(*)=0 and exists(
      select 1 from public.studio_memberships
      where builder_id=auth.uid() and status='active'
    )
  ) from public.orders o
  where o.assigned_builder_id=auth.uid()
    and o.status in ('pending_payment','paid','in_progress','delivered','disputed');
$$;

create or replace function public.leave_my_studio()
returns void language plpgsql security definer set search_path=public set row_security=off as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists(select 1 from public.orders where assigned_builder_id=auth.uid()
      and status in ('pending_payment','paid','in_progress','delivered','disputed')) then
    raise exception 'Complete your outstanding studio build before leaving';
  end if;
  update public.studio_memberships set status='removed',removed_at=now(),availability_status='busy',busy_source=null
   where builder_id=auth.uid() and status='active';
  if not found then raise exception 'Active studio membership not found'; end if;
  update public.builder_profiles set profile_type='independent',studio_id=null,studio_promo_bps=null,
    studio_promo_ends_at=null,availability_status='busy',is_available=false where id=auth.uid();
end;
$$;
revoke all on function public.get_my_studio_leave_eligibility() from public;
revoke all on function public.leave_my_studio() from public;
grant execute on function public.get_my_studio_leave_eligibility(), public.leave_my_studio() to authenticated;

-- Invitation acceptance creates a durable cleanup request for unsold assets,
-- deletes those listings, and only unlists listings with purchase history.
create table if not exists public.ready_build_asset_cleanup_jobs(
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  image_paths text[] not null default '{}',
  world_paths text[] not null default '{}',
  preview_paths text[] not null default '{}',
  status text not null default 'pending' check(status in ('pending','complete','failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.ready_build_asset_cleanup_jobs enable row level security;

drop function if exists public.respond_to_studio_builder_invitation(uuid,text);
create function public.respond_to_studio_builder_invitation(p_invitation uuid,p_response text)
returns jsonb language plpgsql security definer set search_path=public set row_security=off as $$
declare me uuid:=auth.uid(); v_inv public.studio_builder_invitations%rowtype; v_job uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('accept','decline') then raise exception 'Invalid invitation response'; end if;
  select * into v_inv from public.studio_builder_invitations where id=p_invitation and builder_id=me for update;
  if v_inv.id is null or v_inv.status<>'pending' then raise exception 'Invitation is no longer pending'; end if;
  if p_response='decline' then
    update public.studio_builder_invitations set status='declined',responded_at=now() where id=v_inv.id;
    return jsonb_build_object('accepted',false);
  end if;
  if exists(select 1 from public.studio_memberships where builder_id=me and status='active') then
    raise exception 'This account already belongs to a studio';
  end if;
  if exists(select 1 from public.ready_builds l where l.builder_id=me and not exists(
      select 1 from public.ready_build_purchases p where p.listing_id=l.id)) then
    insert into public.ready_build_asset_cleanup_jobs(owner_user_id,image_paths,world_paths,preview_paths)
    select me,
      coalesce(array_agg(distinct m.storage_path) filter(where m.storage_path is not null),array[]::text[]),
      coalesce(array_agg(distinct v.world_path) filter(where v.world_path is not null),array[]::text[]),
      coalesce(array_agg(distinct v.preview_path) filter(where v.preview_path is not null),array[]::text[])
    from public.ready_builds l
    left join public.ready_build_media m on m.listing_id=l.id
    left join public.ready_build_versions v on v.listing_id=l.id
    where l.builder_id=me and not exists(select 1 from public.ready_build_purchases p where p.listing_id=l.id)
    returning id into v_job;
  end if;
  delete from public.ready_builds l where l.builder_id=me and not exists(
    select 1 from public.ready_build_purchases p where p.listing_id=l.id);
  update public.ready_builds set is_active=false,updated_at=now() where builder_id=me;
  update public.builder_profiles set profile_type='studio_employee',studio_id=v_inv.studio_id,
    availability_status='available',is_available=true where id=me;
  insert into public.studio_memberships(studio_id,builder_id,availability_status,busy_source)
  values(v_inv.studio_id,me,'available',null);
  update public.studio_builder_invitations set status='accepted',responded_at=now() where id=v_inv.id;
  update public.studio_builder_invitations set status='declined',responded_at=now()
   where builder_id=me and status='pending' and id<>v_inv.id;
  return jsonb_build_object('accepted',true,'cleanup_job_id',v_job);
end;
$$;
revoke all on function public.respond_to_studio_builder_invitation(uuid,text) from public;
grant execute on function public.respond_to_studio_builder_invitation(uuid,text) to authenticated;

-- Ready-build studio proceeds participate in the existing studio balance.
create or replace function public.get_my_studio_payout_summary()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_studio uuid; v_earned bigint; v_reserved bigint; v_sent bigint;
begin
  select id into v_studio from public.studios where moderator_id=auth.uid();
  if v_studio is null then raise exception 'Studio not found'; end if;
  select coalesce(sum(amount),0) into v_earned from (
    select studio_earnings_kopecks::bigint amount from public.orders where studio_id=v_studio and status='completed'
    union all
    select seller_earnings_kopecks::bigint from public.ready_build_purchases where studio_id=v_studio and status='paid'
  ) earned;
  select coalesce(sum(amount_cents) filter(where status in ('requested','approved','processing')),0),
         coalesce(sum(amount_cents) filter(where status='sent'),0)
    into v_reserved,v_sent from public.payouts where studio_id=v_studio;
  return jsonb_build_object('studio_id',v_studio,'earned_cents',v_earned,'pending_cents',v_reserved,
    'withdrawn_cents',v_sent,'available_cents',greatest(v_earned-v_reserved-v_sent,0));
end;
$$;

-- Studio account deletion is blocked while buyer obligations remain. When it
-- proceeds, active employees are restored as private rookie builders.
create or replace function public.get_my_studio_delete_eligibility()
returns jsonb language sql stable security definer set search_path=public set row_security=off as $$
  with mine as (select id from public.studios where moderator_id=auth.uid()), blocked as (
    select count(*) total from public.orders where studio_id=(select id from mine)
      and status in ('pending_payment','paid','in_progress','delivered','disputed')
  ) select jsonb_build_object('is_studio',exists(select 1 from mine),
    'blocking_order_count',total,'can_delete',total=0) from blocked;
$$;
revoke all on function public.get_my_studio_delete_eligibility() from public;
grant execute on function public.get_my_studio_delete_eligibility() to authenticated;

create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path=public,auth set row_security=off as $$
declare v_uid uuid:=auth.uid(); v_studio uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select id into v_studio from public.studios where moderator_id=v_uid for update;
  if v_studio is not null and exists(select 1 from public.orders where studio_id=v_studio
      and status in ('pending_payment','paid','in_progress','delivered','disputed')) then
    raise exception 'Complete all outstanding studio orders before deleting the studio';
  end if;
  -- The delete-account Edge Function removes Storage objects through the
  -- supported Storage API before calling this transaction. Do not delete from
  -- storage.objects here (see migration 0055).
  if v_studio is not null then
    update public.builder_profiles bp set profile_type='independent',studio_id=null,studio_promo_bps=null,
      studio_promo_ends_at=null,rank='rookie',availability_status='busy',is_available=false
    where exists(select 1 from public.studio_memberships m where m.studio_id=v_studio
      and m.builder_id=bp.id and m.status='active');
    update public.studio_memberships set status='removed',removed_at=now(),availability_status='busy',busy_source=null
      where studio_id=v_studio and status='active';
    update public.studio_order_assignments set released_at=coalesce(released_at,now()),release_reason=coalesce(release_reason,'studio_deleted')
      where studio_id=v_studio and released_at is null;
    update public.ready_builds set is_active=false,updated_at=now() where studio_id=v_studio;
    update public.studios set status='suspended',accepting_orders=false,moderator_id=null where id=v_studio;
  end if;
  delete from public.studio_moderator_invites where created_by=v_uid;
  delete from public.studio_order_assignments where builder_id=v_uid;
  delete from public.studio_employee_earnings where builder_id=v_uid;
  delete from public.studio_memberships where builder_id=v_uid;
  delete from auth.users where id=v_uid;
end;
$$;
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

grant execute on function public.update_ready_build(uuid,text,text,text,int,boolean),
  public.attach_ready_build_version(uuid,text,text,bigint,text,jsonb),
  public.attach_ready_build_media(uuid,text,text,text,int),
  public.reorder_ready_build_media(uuid,uuid[]), public.create_ready_build_purchase(uuid),
  public.prepare_ready_build_delete(uuid), public.delete_ready_build(uuid) to authenticated;
grant execute on function public.mark_ready_build_purchase_paid_internal(uuid,text,int,jsonb) to service_role;

notify pgrst, 'reload schema';
