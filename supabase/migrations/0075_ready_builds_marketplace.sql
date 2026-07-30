-- Ready-made builds marketplace. Listings are owned by independent builders,
-- while every paid purchase snapshots an immutable world-file version.
create extension if not exists "pgcrypto";

create table public.ready_builds (
  id uuid primary key default gen_random_uuid(),
  builder_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text not null check (char_length(btrim(description)) between 10 and 4000),
  style text not null check (char_length(btrim(style)) between 2 and 64),
  price_kopecks int not null check (price_kopecks >= 2000),
  is_active boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ready_build_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.ready_builds(id) on delete cascade,
  world_path text not null,
  world_file_name text not null,
  world_size_bytes bigint not null check (world_size_bytes > 0 and world_size_bytes <= 209715200),
  preview_path text not null,
  preview_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.ready_builds
  add constraint ready_builds_current_version_fk foreign key (current_version_id)
  references public.ready_build_versions(id) on delete set null;

create table public.ready_build_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.ready_builds(id) on delete cascade,
  storage_path text not null,
  url text not null,
  alt text,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create unique index ready_build_media_position_idx on public.ready_build_media(listing_id, position);

create table public.ready_build_purchases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.ready_builds(id) on delete restrict,
  version_id uuid not null references public.ready_build_versions(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  builder_id uuid not null references public.profiles(id) on delete restrict,
  title_snapshot text not null,
  price_kopecks int not null check (price_kopecks > 0),
  commission_kopecks int not null check (commission_kopecks >= 0),
  builder_earnings_kopecks int not null check (builder_earnings_kopecks >= 0),
  world_path_snapshot text not null,
  world_file_name_snapshot text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index ready_build_purchases_buyer_idx on public.ready_build_purchases(buyer_id, created_at desc);
create index ready_build_purchases_builder_idx on public.ready_build_purchases(builder_id, created_at desc);

create table public.ready_build_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.ready_build_purchases(id) on delete cascade,
  invoice_id text,
  amount_cents int not null check (amount_cents > 0),
  requested_currency text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ready_build_payouts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.ready_build_purchases(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'blocked')),
  created_at timestamptz not null default now()
);

create or replace function public.is_independent_builder(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.builder_profiles b on b.id = p.id
     where p.id = p_user and p.role in ('builder', 'both')
       and coalesce(b.profile_type, 'independent') = 'independent'
  );
$$;

create or replace function public.create_ready_build(p_title text, p_description text, p_style text, p_price_kopecks int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; begin
  if auth.uid() is null or not public.is_independent_builder(auth.uid()) then raise exception 'Only independent builders can publish ready-made builds'; end if;
  insert into public.ready_builds(builder_id, title, description, style, price_kopecks)
  values(auth.uid(), btrim(p_title), btrim(p_description), lower(btrim(p_style)), p_price_kopecks) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_ready_build(p_listing uuid, p_title text, p_description text, p_style text, p_price_kopecks int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ready_builds set title=btrim(p_title), description=btrim(p_description), style=lower(btrim(p_style)), price_kopecks=p_price_kopecks, is_active=false, updated_at=now()
   where id=p_listing and builder_id=auth.uid();
  if not found then raise exception 'Listing not found'; end if;
  if p_active then
    if not exists(select 1 from public.ready_build_versions where id=(select current_version_id from public.ready_builds where id=p_listing))
       or not exists(select 1 from public.ready_build_media where listing_id=p_listing) then raise exception 'Add photos and a world preview before publishing'; end if;
    update public.ready_builds set is_active=true, updated_at=now() where id=p_listing;
  end if;
end; $$;

create or replace function public.attach_ready_build_version(p_listing uuid, p_world_path text, p_file_name text, p_size bigint, p_preview_path text, p_preview_meta jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; begin
  if not exists(select 1 from public.ready_builds where id=p_listing and builder_id=auth.uid()) then raise exception 'Listing not found'; end if;
  if p_file_name !~* '\.zip$' then raise exception 'Ready-made worlds must be ZIP files'; end if;
  if p_world_path not like p_listing::text || '/%' or p_preview_path not like p_listing::text || '/%' then raise exception 'Invalid listing asset path'; end if;
  insert into public.ready_build_versions(listing_id,world_path,world_file_name,world_size_bytes,preview_path,preview_meta)
  values(p_listing,p_world_path,btrim(p_file_name),p_size,p_preview_path,coalesce(p_preview_meta,'{}'::jsonb)) returning id into v_id;
  update public.ready_builds set current_version_id=v_id, updated_at=now() where id=p_listing;
  return v_id;
end; $$;

create or replace function public.create_ready_build_purchase(p_listing uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_listing public.ready_builds; v_version public.ready_build_versions; v_bps int; v_commission int; v_purchase uuid; begin
  select * into v_listing from public.ready_builds where id=p_listing and is_active=true for share;
  if v_listing.id is null then raise exception 'This build is no longer for sale'; end if;
  if auth.uid() is null or auth.uid()=v_listing.builder_id then raise exception 'You cannot buy your own build'; end if;
  select * into v_version from public.ready_build_versions where id=v_listing.current_version_id;
  if v_version.id is null then raise exception 'This listing is unavailable'; end if;
  select public.commission_bps_for_rank(coalesce(rank,'rookie')) into v_bps from public.builder_profiles where id=v_listing.builder_id;
  v_commission := (v_listing.price_kopecks * coalesce(v_bps, 1500)) / 10000;
  insert into public.ready_build_purchases(listing_id,version_id,buyer_id,builder_id,title_snapshot,price_kopecks,commission_kopecks,builder_earnings_kopecks,world_path_snapshot,world_file_name_snapshot)
  values(p_listing,v_version.id,auth.uid(),v_listing.builder_id,v_listing.title,v_listing.price_kopecks,v_commission,v_listing.price_kopecks-v_commission,v_version.world_path,v_version.world_file_name) returning id into v_purchase;
  return v_purchase;
end; $$;

create or replace function public.record_ready_build_payment(p_purchase uuid, p_invoice text, p_amount int, p_currency text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.ready_build_purchases where id=p_purchase) then raise exception 'Purchase not found'; end if;
  insert into public.ready_build_payments(purchase_id,invoice_id,amount_cents,requested_currency) values(p_purchase,p_invoice,p_amount,lower(p_currency))
  on conflict(purchase_id) do update set invoice_id=excluded.invoice_id, amount_cents=excluded.amount_cents, requested_currency=excluded.requested_currency,
    status=case when public.ready_build_payments.status='paid' then 'paid' else 'pending' end, updated_at=now();
end; $$;

create or replace function public.mark_ready_build_purchase_paid_internal(p_purchase uuid, p_invoice text, p_amount int, p_raw jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v public.ready_build_purchases; begin
  select * into v from public.ready_build_purchases where id=p_purchase for update;
  if v.id is null then raise exception 'Purchase not found'; end if;
  if p_amount <> v.price_kopecks then raise exception 'Payment amount does not match purchase'; end if;
  insert into public.ready_build_payments(purchase_id,invoice_id,amount_cents,status,raw) values(p_purchase,p_invoice,p_amount,'paid',p_raw)
  on conflict(purchase_id) do update set invoice_id=coalesce(excluded.invoice_id,ready_build_payments.invoice_id),status='paid',raw=excluded.raw,updated_at=now();
  if v.status='paid' then return; end if;
  update public.ready_build_purchases set status='paid', paid_at=now() where id=p_purchase;
  insert into public.ready_build_payouts(purchase_id,builder_id,amount_cents,status)
  values(p_purchase,v.builder_id,v.builder_earnings_kopecks,case when exists(select 1 from public.builder_profiles where id=v.builder_id and nullif(btrim(payout_details),'') is not null) then 'pending' else 'blocked' end)
  on conflict(purchase_id) do nothing;
end; $$;

create or replace function public.get_ready_build_download(p_purchase uuid)
returns table(storage_path text, file_name text) language sql security definer set search_path = public as $$
  select world_path_snapshot, world_file_name_snapshot from public.ready_build_purchases
   where id=p_purchase and buyer_id=auth.uid() and status='paid';
$$;

alter table public.ready_builds enable row level security;
alter table public.ready_build_versions enable row level security;
alter table public.ready_build_media enable row level security;
alter table public.ready_build_purchases enable row level security;
alter table public.ready_build_payments enable row level security;
alter table public.ready_build_payouts enable row level security;
create policy "public active ready builds" on public.ready_builds for select using (is_active or builder_id=auth.uid());
create policy "public ready build versions" on public.ready_build_versions for select using (exists(select 1 from public.ready_builds l where l.id=listing_id and (l.is_active or l.builder_id=auth.uid())));
create policy "public ready build media" on public.ready_build_media for select using (exists(select 1 from public.ready_builds l where l.id=listing_id and (l.is_active or l.builder_id=auth.uid())));
create policy "owners manage ready build media" on public.ready_build_media for all using (exists(select 1 from public.ready_builds l where l.id=listing_id and l.builder_id=auth.uid())) with check (exists(select 1 from public.ready_builds l where l.id=listing_id and l.builder_id=auth.uid()));
create policy "buyers read purchases" on public.ready_build_purchases for select using (buyer_id=auth.uid() or builder_id=auth.uid());
create policy "participants read ready payments" on public.ready_build_payments for select using (exists(select 1 from public.ready_build_purchases p where p.id=purchase_id and (p.buyer_id=auth.uid() or p.builder_id=auth.uid())));
create policy "builders read ready payouts" on public.ready_build_payouts for select using (builder_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit) values
 ('ready_build_images','ready_build_images',true,10485760), ('ready_build_worlds','ready_build_worlds',false,209715200), ('ready_build_previews','ready_build_previews',true,52428800)
on conflict(id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;
create policy "ready build owners write assets" on storage.objects for insert with check (bucket_id in ('ready_build_images','ready_build_worlds','ready_build_previews') and exists(select 1 from public.ready_builds l where l.id::text=(storage.foldername(name))[1] and l.builder_id=auth.uid()));
create policy "ready build owners update assets" on storage.objects for update using (bucket_id in ('ready_build_images','ready_build_worlds','ready_build_previews') and exists(select 1 from public.ready_builds l where l.id::text=(storage.foldername(name))[1] and l.builder_id=auth.uid()));
create policy "ready build owners delete assets" on storage.objects for delete using (bucket_id in ('ready_build_images','ready_build_worlds','ready_build_previews') and exists(select 1 from public.ready_builds l where l.id::text=(storage.foldername(name))[1] and l.builder_id=auth.uid()));
create policy "paid buyers read ready worlds" on storage.objects for select using (bucket_id='ready_build_worlds' and exists(select 1 from public.ready_build_purchases p where p.world_path_snapshot=name and p.buyer_id=auth.uid() and p.status='paid'));

revoke all on function public.create_ready_build(text,text,text,int) from public;
revoke all on function public.update_ready_build(uuid,text,text,text,int,boolean) from public;
revoke all on function public.attach_ready_build_version(uuid,text,text,bigint,text,jsonb) from public;
revoke all on function public.create_ready_build_purchase(uuid) from public;
revoke all on function public.record_ready_build_payment(uuid,text,int,text) from public;
revoke all on function public.mark_ready_build_purchase_paid_internal(uuid,text,int,jsonb) from public;
revoke all on function public.get_ready_build_download(uuid) from public;
grant execute on function public.create_ready_build(text,text,text,int), public.update_ready_build(uuid,text,text,text,int,boolean), public.attach_ready_build_version(uuid,text,text,bigint,text,jsonb), public.create_ready_build_purchase(uuid), public.get_ready_build_download(uuid) to authenticated;
grant execute on function public.record_ready_build_payment(uuid,text,int,text), public.mark_ready_build_purchase_paid_internal(uuid,text,int,jsonb) to service_role;
notify pgrst, 'reload schema';
