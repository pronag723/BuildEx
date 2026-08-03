-- Versioned legal acceptance, listing disclosures, dispute deadline, and
-- confirmed manual-refund controls required for the legal launch baseline.

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('terms','privacy','payments','sellers','readyBuildLicense','community')),
  document_version text not null check (char_length(document_version) between 1 and 32),
  context text not null check (context in ('account_creation','renewal')),
  accepted_at timestamptz not null default now(),
  unique (user_id, document_type, document_version, context)
);

create table public.legal_checkout_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject_type text not null check (subject_type in ('custom_order','ready_build')),
  subject_id uuid not null,
  seller_id uuid not null,
  terms_version text not null,
  privacy_version text not null,
  payment_policy_version text not null,
  license_version text,
  pay_currency text,
  immediate_delivery boolean not null default false,
  final_sale boolean not null default false,
  scope_snapshot jsonb not null,
  accepted_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

alter table public.legal_acceptances enable row level security;
alter table public.legal_checkout_acceptances enable row level security;
create policy "users read own legal acceptances" on public.legal_acceptances for select
  using (user_id = auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and is_admin));
create policy "users read own checkout acceptances" on public.legal_checkout_acceptances for select
  using (user_id = auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and is_admin));

create or replace function public.record_legal_acceptance(p_document_type text, p_document_version text, p_context text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_document_type not in ('terms','privacy','payments','sellers','readyBuildLicense','community') then raise exception 'Unknown legal document'; end if;
  if nullif(btrim(p_document_version),'') is null then raise exception 'Document version is required'; end if;
  if btrim(p_document_version)<>'1.0' then raise exception 'The submitted legal version is not current'; end if;
  if p_context not in ('account_creation','renewal') then raise exception 'Invalid acceptance context'; end if;
  insert into public.legal_acceptances(user_id,document_type,document_version,context)
  values(auth.uid(),p_document_type,btrim(p_document_version),p_context)
  on conflict(user_id,document_type,document_version,context) do nothing;
end; $$;

alter table public.ready_builds
  add column minecraft_edition text not null default 'Java Edition',
  add column minecraft_version text not null default 'Not specified',
  add column file_format text not null default 'ZIP world',
  add column included_content text not null default 'World files described in the listing',
  add column dependencies text not null default 'None',
  add column license_version text not null default '1.0';

-- Existing rows lack the newly required compatibility disclosure. Return them
-- to draft until their sellers complete it truthfully.
update public.ready_builds set is_active=false where minecraft_version='Not specified';

create or replace function public.set_ready_build_disclosures(
  p_listing uuid, p_edition text, p_version text, p_file_format text,
  p_included_content text, p_dependencies text, p_license_version text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if nullif(btrim(p_edition),'') is null or nullif(btrim(p_version),'') is null or lower(btrim(p_version))='not specified'
     or nullif(btrim(p_file_format),'') is null or nullif(btrim(p_included_content),'') is null
     or nullif(btrim(p_dependencies),'') is null or nullif(btrim(p_license_version),'') is null then
    raise exception 'Complete all compatibility, content, dependency, and license disclosures';
  end if;
  update public.ready_builds set minecraft_edition=btrim(p_edition), minecraft_version=btrim(p_version),
    file_format=btrim(p_file_format), included_content=btrim(p_included_content), dependencies=btrim(p_dependencies),
    license_version=btrim(p_license_version), is_active=false, updated_at=now()
  where id=p_listing and builder_id=auth.uid();
  if not found then raise exception 'Listing not found'; end if;
end; $$;

create or replace function public.record_checkout_acceptance(
  p_subject_type text, p_subject_id uuid, p_pay_currency text,
  p_terms_version text, p_privacy_version text, p_payment_policy_version text,
  p_license_version text default null, p_immediate_delivery boolean default false,
  p_final_sale boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_seller uuid; v_scope jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if btrim(coalesce(p_terms_version,''))<>'1.0' or btrim(coalesce(p_privacy_version,''))<>'1.0'
     or btrim(coalesce(p_payment_policy_version,''))<>'1.0' then
    raise exception 'Accept the current legal policy versions';
  end if;
  if p_subject_type='custom_order' then
    select coalesce(o.studio_id,o.builder_id), jsonb_build_object(
      'order_id',o.id,'seller_type',case when o.studio_id is null then 'builder' else 'studio' end,
      'seller_id',coalesce(o.studio_id,o.builder_id),'size',o.building_size,'size_label',o.size_label,
      'style',o.style,'brief',o.brief,'price_kopecks',o.price_kopecks)
    into v_seller,v_scope from public.orders o
    where o.id=p_subject_id and o.buyer_id=v_user and o.status='pending_payment';
  elsif p_subject_type='ready_build' then
    if not p_immediate_delivery or not p_final_sale or btrim(coalesce(p_license_version,''))<>'1.0' then
      raise exception 'Immediate-delivery, final-sale, and license acceptance are required';
    end if;
    select p.builder_id, jsonb_build_object(
      'purchase_id',p.id,'listing_id',p.listing_id,'version_id',p.version_id,'seller_id',p.builder_id,
      'title',p.title_snapshot,'price_kopecks',p.price_kopecks,'file_name',p.world_file_name_snapshot,
      'file_size_bytes',v.world_size_bytes,'minecraft_edition',l.minecraft_edition,
      'minecraft_version',l.minecraft_version,'file_format',l.file_format,
      'included_content',l.included_content,'dependencies',l.dependencies)
    into v_seller,v_scope from public.ready_build_purchases p
    join public.ready_builds l on l.id=p.listing_id join public.ready_build_versions v on v.id=p.version_id
    where p.id=p_subject_id and p.buyer_id=v_user and p.status='pending_payment';
  else raise exception 'Unknown checkout subject'; end if;
  if v_seller is null then raise exception 'Checkout not found or not payable by this user'; end if;
  insert into public.legal_checkout_acceptances(user_id,subject_type,subject_id,seller_id,
    terms_version,privacy_version,payment_policy_version,license_version,pay_currency,
    immediate_delivery,final_sale,scope_snapshot)
  values(v_user,p_subject_type,p_subject_id,v_seller,btrim(p_terms_version),btrim(p_privacy_version),
    btrim(p_payment_policy_version),nullif(btrim(coalesce(p_license_version,'')),''),lower(nullif(btrim(coalesce(p_pay_currency,'')),'')),
    p_immediate_delivery,p_final_sale,v_scope)
  on conflict(subject_type,subject_id) do update set
    terms_version=excluded.terms_version, privacy_version=excluded.privacy_version,
    payment_policy_version=excluded.payment_policy_version, license_version=excluded.license_version,
    pay_currency=excluded.pay_currency, immediate_delivery=excluded.immediate_delivery,
    final_sale=excluded.final_sale, scope_snapshot=excluded.scope_snapshot, accepted_at=now()
  where public.legal_checkout_acceptances.user_id=excluded.user_id;
end; $$;

revoke all on function public.record_legal_acceptance(text,text,text) from public;
revoke all on function public.record_checkout_acceptance(text,uuid,text,text,text,text,text,boolean,boolean) from public;
revoke all on function public.set_ready_build_disclosures(uuid,text,text,text,text,text,text) from public;
grant execute on function public.record_legal_acceptance(text,text,text), public.record_checkout_acceptance(text,uuid,text,text,text,text,text,boolean,boolean), public.set_ready_build_disclosures(uuid,text,text,text,text,text,text) to authenticated;

-- Preserve the hardened implementation, then place the seven-day deadline in
-- front of it. Both checks execute in the same transaction.
alter function public.open_dispute(uuid,text) rename to open_dispute_pre_legal;
revoke all on function public.open_dispute_pre_legal(uuid,text) from public;
create function public.open_dispute(p_order uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_delivered timestamptz; v_buyer uuid;
begin
  select delivered_at,buyer_id into v_delivered,v_buyer from public.orders where id=p_order;
  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer<>auth.uid() then raise exception 'Only the buyer can open a dispute'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 20 then raise exception 'Describe the material mismatch and evidence in at least 20 characters'; end if;
  if v_delivered is null or now()>v_delivered+interval '7 days' then raise exception 'The seven-day dispute window has closed'; end if;
  return public.open_dispute_pre_legal(p_order,p_reason);
end; $$;
revoke all on function public.open_dispute(uuid,text) from public;
grant execute on function public.open_dispute(uuid,text) to authenticated;

create table public.refund_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'nowpayments_or_manual',
  provider_reference text,
  asset_network text,
  amount_cents int not null check(amount_cents>0),
  status text not null check(status in ('confirmed','failed')),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  failure_note text,
  created_at timestamptz not null default now(),
  check ((status='confirmed' and provider_reference is not null and confirmed_at is not null) or (status='failed' and failure_note is not null))
);
create unique index refund_records_confirmed_order_idx on public.refund_records(order_id) where status='confirmed';
create unique index refund_records_provider_reference_idx on public.refund_records(provider_reference) where provider_reference is not null;
alter table public.refund_records enable row level security;
create policy "participants read refund records" on public.refund_records for select using (
  exists(select 1 from public.orders o where o.id=order_id and (o.buyer_id=auth.uid() or o.builder_id=auth.uid() or o.assigned_builder_id=auth.uid()))
  or exists(select 1 from public.profiles where id=auth.uid() and is_admin));

alter function public.resolve_dispute(uuid,text,text) rename to resolve_dispute_pre_legal;
revoke all on function public.resolve_dispute_pre_legal(uuid,text,text) from public;
create function public.resolve_dispute(p_order uuid,p_outcome text,p_note text,p_refund_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); v_payment public.payments%rowtype; v_ref text:=nullif(btrim(coalesce(p_refund_reference,'')),'');
begin
  if not exists(select 1 from public.profiles where id=me and is_admin) then raise exception 'Only an admin can resolve disputes'; end if;
  if p_outcome='refund' then
    if v_ref is null then raise exception 'A confirmed provider or transaction reference is required before recording a refund'; end if;
    select * into v_payment from public.payments where order_id=p_order and status='paid' for update;
    if v_payment.id is null then raise exception 'No confirmed paid transaction exists for this order'; end if;
    insert into public.refund_records(order_id,payment_id,provider,provider_reference,asset_network,amount_cents,status,confirmed_by,confirmed_at)
    values(p_order,v_payment.id,coalesce(v_payment.provider,'nowpayments'),v_ref,
      coalesce(v_payment.requested_currency,v_payment.currency),v_payment.amount_cents,'confirmed',me,now());
    update public.payments set status='refunded',updated_at=now() where id=v_payment.id;
  end if;
  perform public.resolve_dispute_pre_legal(p_order,p_outcome,p_note);
end; $$;
revoke all on function public.resolve_dispute(uuid,text,text,text) from public;
grant execute on function public.resolve_dispute(uuid,text,text,text) to authenticated;

-- Keep the old call shape for release-only clients; a refund can no longer be
-- recorded without the new confirmed-reference argument.
create function public.resolve_dispute(p_order uuid,p_outcome text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_outcome='refund' then raise exception 'Use the confirmed refund workflow and provide a provider reference'; end if;
  perform public.resolve_dispute(p_order,p_outcome,p_note,null);
end; $$;
revoke all on function public.resolve_dispute(uuid,text,text) from public;
grant execute on function public.resolve_dispute(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
