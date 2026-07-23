-- =============================================================================
-- BuildEx — managed studios: lifecycle, delivery, reviews, inbox and balances
-- Depends on 0041 + 0042.
-- =============================================================================

-- The original referral schema restricted slugs to hyphens. Managed studio
-- usernames use the same underscore-friendly rules as account usernames.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.studios'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%slug%'
  loop
    execute format('alter table public.studios drop constraint %I', c);
  end loop;
end$$;
alter table public.studios
  add constraint studios_username_format_check
  check (slug::text ~ '^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$');

create or replace function public.refresh_studio_available_employees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid;
begin
  v_studio := case when tg_op = 'DELETE' then old.studio_id else new.studio_id end;
  update public.studios
     set available_employees = (
       select count(*) from public.studio_memberships m
        where m.studio_id = v_studio
          and m.status = 'active'
          and m.availability_status = 'available'
     )
   where id = v_studio;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists studio_memberships_refresh_available on public.studio_memberships;
create trigger studio_memberships_refresh_available
  after insert or update or delete on public.studio_memberships
  for each row execute function public.refresh_studio_available_employees();

-- ─── Assignment release + earning helpers ──────────────────────────────────

create or replace function public._release_studio_assignment(
  p_order uuid,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare v_builder uuid; v_studio uuid;
begin
  select studio_id, assigned_builder_id into v_studio, v_builder
    from public.orders where id = p_order;
  if v_studio is null or v_builder is null then return; end if;

  update public.studio_order_assignments
     set released_at = coalesce(released_at, now()),
         release_reason = coalesce(release_reason, p_reason)
   where order_id = p_order and released_at is null;
  update public.studio_memberships
     set availability_status = 'available', busy_source = null
   where studio_id = v_studio and builder_id = v_builder and status = 'active';
  update public.builder_profiles
     set availability_status = 'available', is_available = true
   where id = v_builder and profile_type = 'studio_employee';
end;
$$;
revoke all on function public._release_studio_assignment(uuid, text) from public;

create or replace function public._accrue_managed_studio_order(p_order uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_studio uuid; v_builder uuid; v_bps int; v_amount int;
begin
  select studio_id, assigned_builder_id, employee_commission_bps_snapshot,
         employee_owed_kopecks
    into v_studio, v_builder, v_bps, v_amount
    from public.orders where id = p_order;
  if v_studio is null or v_builder is null then return; end if;
  insert into public.studio_employee_earnings (
    order_id, studio_id, builder_id, commission_bps, amount_kopecks
  )
  values (p_order, v_studio, v_builder, coalesce(v_bps, 0), coalesce(v_amount, 0))
  on conflict (order_id) do nothing;
end;
$$;
revoke all on function public._accrue_managed_studio_order(uuid) from public;

-- ─── Payment settlement with studio notification ───────────────────────────

create or replace function public.mark_order_paid_internal(
  p_order uuid,
  p_invoice text default null,
  p_amount_cents int default null,
  p_method text default null,
  p_raw jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status; v_price int; v_currency text;
  v_buyer uuid; v_builder uuid; v_studio uuid; v_moderator uuid; v_conv uuid;
begin
  select status, price_kopecks, buyer_id, builder_id, studio_id, conversation_id
    into v_status, v_price, v_buyer, v_builder, v_studio, v_conv
    from public.orders where id = p_order for update;
  if v_status is null then raise exception 'Order not found'; end if;
  if p_amount_cents is null or p_amount_cents <> v_price then
    raise exception 'Payment amount mismatch for order %: got %, expected %',
      p_order, p_amount_cents, v_price;
  end if;
  v_currency := lower(p_raw ->> 'price_currency');
  if v_currency is distinct from 'usd' then
    raise exception 'Payment currency mismatch for order %: got %, expected usd',
      p_order, v_currency;
  end if;

  insert into public.payments (order_id, invoice_id, amount_cents, method, status, raw)
  values (p_order, p_invoice, p_amount_cents, nullif(p_method, ''), 'paid', p_raw)
  on conflict (order_id) do update
    set invoice_id = coalesce(excluded.invoice_id, public.payments.invoice_id),
        amount_cents = excluded.amount_cents,
        method = coalesce(excluded.method, public.payments.method),
        status = 'paid',
        raw = coalesce(excluded.raw, public.payments.raw);
  if v_status <> 'pending_payment' then return; end if;

  update public.orders set status = 'paid', paid_at = now() where id = p_order;
  if v_studio is null then
    v_conv := public._ensure_order_conversation(p_order);
  end if;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, v_buyer, 'Payment received — the order is ready to begin.',
    'order_event',
    jsonb_build_object('event', 'paid', 'order_id', p_order)
  );

  if v_studio is not null then
    select moderator_id into v_moderator from public.studios where id = v_studio;
    perform public._notify(
      v_moderator, 'paid', 'New studio order paid',
      'Assign an available employee to begin work.',
      '/orders/?id=' || p_order::text
    );
  elsif v_builder is not null then
    perform public._notify(
      v_builder, 'paid', 'New order paid',
      'A buyer has paid for a new commission.',
      '/orders/?id=' || p_order::text
    );
  end if;
end;
$$;
revoke all on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) from public;
grant execute on function public.mark_order_paid_internal(uuid, text, int, text, jsonb) to service_role;

-- ─── Start work and delivery ────────────────────────────────────────────────

create or replace function public.builder_start_work(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_builder uuid; v_assigned uuid;
  v_status public.order_status; v_conv uuid; v_buyer uuid; v_moderator uuid; v_studio uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select builder_id, assigned_builder_id, status, conversation_id, buyer_id, studio_id
    into v_builder, v_assigned, v_status, v_conv, v_buyer, v_studio
    from public.orders where id = p_order for update;
  if coalesce(v_assigned, v_builder) is null then raise exception 'Order not found or unassigned'; end if;
  if coalesce(v_assigned, v_builder) <> me then
    raise exception 'Only the assigned builder can start work';
  end if;
  if v_status <> 'paid' then raise exception 'Order is not ready to start'; end if;
  update public.orders set status = 'in_progress', started_at = now() where id = p_order;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, me, 'Work has started on this order.', 'order_event',
    jsonb_build_object('event', 'started', 'order_id', p_order)
  );
  perform public._notify(v_buyer, 'started', 'Work started', 'Your order is now in progress.',
    '/orders/?id=' || p_order::text);
  if v_studio is not null then
    select moderator_id into v_moderator from public.studios where id = v_studio;
    if v_moderator <> me then
      perform public._notify(v_moderator, 'started', 'Studio order started',
        'The assigned employee started work.', '/orders/?id=' || p_order::text);
    end if;
  end if;
end;
$$;
revoke all on function public.builder_start_work(uuid) from public;
grant execute on function public.builder_start_work(uuid) to authenticated;

create or replace function public.builder_attach_delivery(
  p_order uuid,
  p_path text,
  p_file_name text,
  p_size bigint,
  p_note text default null,
  p_preview_path text default null,
  p_preview_meta jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_builder uuid; v_assigned uuid;
  v_status public.order_status; v_delivery uuid; v_conv uuid; v_buyer uuid;
  v_studio uuid; v_moderator uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_size <= 0 or p_size > 1073741824 then raise exception 'Invalid delivery size'; end if;
  select builder_id, assigned_builder_id, status, conversation_id, buyer_id, studio_id
    into v_builder, v_assigned, v_status, v_conv, v_buyer, v_studio
    from public.orders where id = p_order for update;
  if coalesce(v_assigned, v_builder) <> me then
    raise exception 'Only the assigned builder can deliver';
  end if;
  if v_status <> 'in_progress' then raise exception 'Order is not ready for delivery'; end if;
  if split_part(p_path, '/', 1) <> p_order::text then
    raise exception 'Storage path must be scoped to this order';
  end if;
  if p_preview_path is not null and split_part(p_preview_path, '/', 1) <> p_order::text then
    raise exception 'Preview path must be scoped to this order';
  end if;

  insert into public.order_deliveries (
    order_id, storage_path, file_name, size_bytes, note, preview_path, preview_meta
  )
  values (
    p_order, p_path, p_file_name, p_size,
    nullif(btrim(coalesce(p_note, '')), ''), p_preview_path, p_preview_meta
  )
  on conflict (order_id) do update
    set storage_path = excluded.storage_path, file_name = excluded.file_name,
        size_bytes = excluded.size_bytes, note = excluded.note,
        preview_path = excluded.preview_path, preview_meta = excluded.preview_meta,
        created_at = now()
  returning id into v_delivery;

  update public.orders set status = 'delivered', delivered_at = now() where id = p_order;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, me, 'Delivery uploaded — review it before confirming completion.',
    'order_event',
    jsonb_build_object('event', 'delivered', 'order_id', p_order, 'file_name', p_file_name)
  );
  perform public._notify(v_buyer, 'delivered', 'Delivery ready',
    'Review the delivery and confirm when you are satisfied.',
    '/orders/?id=' || p_order::text);
  if v_studio is not null then
    select moderator_id into v_moderator from public.studios where id = v_studio;
    perform public._notify(v_moderator, 'delivered', 'Studio order delivered',
      'The assigned employee uploaded the delivery.', '/orders/?id=' || p_order::text);
  end if;
  return v_delivery;
end;
$$;
revoke all on function public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) from public;
grant execute on function public.builder_attach_delivery(uuid, text, text, bigint, text, text, jsonb) to authenticated;

-- Delivery and preview storage are writable only by the independent builder or
-- the currently assigned studio employee.
drop policy if exists "deliverables: builder writes own order" on storage.objects;
create policy "deliverables: assigned builder writes order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

drop policy if exists "deliverables: builder mutates own pre-delivery" on storage.objects;
create policy "deliverables: assigned builder mutates pre-delivery"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  )
  with check (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

drop policy if exists "deliverables: builder removes own pre-delivery" on storage.objects;
create policy "deliverables: assigned builder removes pre-delivery"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

drop policy if exists "deliverables: buyer-after-complete or builder-anytime" on storage.objects;
create policy "deliverables: buyer after complete or assigned builder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'deliverables'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and (
           coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
           or (o.buyer_id = auth.uid() and o.status = 'completed')
           or exists (
             select 1 from public.studios s
              where s.id = o.studio_id and s.moderator_id = auth.uid()
           )
         )
    )
  );

drop policy if exists "order_previews: builder writes own order" on storage.objects;
create policy "order_previews: assigned builder writes order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

drop policy if exists "order_previews: any party reads anytime" on storage.objects;
create policy "order_previews: marketplace participants read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or exists (
             select 1 from public.studios s where s.id = o.studio_id and s.moderator_id = auth.uid()
           )
         )
    )
  );

-- ─── Complete and cancel ─────────────────────────────────────────────────────

create or replace function public.buyer_confirm_complete(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_buyer uuid; v_builder uuid; v_assigned uuid;
  v_studio uuid; v_status public.order_status; v_conv uuid; v_moderator uuid;
begin
  select buyer_id, builder_id, assigned_builder_id, studio_id, status, conversation_id
    into v_buyer, v_builder, v_assigned, v_studio, v_status, v_conv
    from public.orders where id = p_order for update;
  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer <> me then raise exception 'Only the buyer can confirm'; end if;
  if v_status <> 'delivered' then raise exception 'Order is not awaiting confirmation'; end if;
  update public.orders set status = 'completed', completed_at = now() where id = p_order;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, me, 'Buyer confirmed the delivery — order completed.',
    'order_event', jsonb_build_object('event', 'completed', 'order_id', p_order)
  );
  if v_studio is not null then
    perform public._accrue_managed_studio_order(p_order);
    perform public._release_studio_assignment(p_order, 'completed');
    update public.studios
       set completed_orders = (
         select count(*) from public.orders o where o.studio_id = v_studio and o.status = 'completed'
       )
     where id = v_studio;
    select moderator_id into v_moderator from public.studios where id = v_studio;
    perform public._notify(v_moderator, 'completed', 'Studio order completed',
      'Revenue is now available in the studio balance.', '/orders/?id=' || p_order::text);
    if v_assigned is not null then
      perform public._notify(v_assigned, 'completed', 'Order completed',
        'Your employee commission amount has been recorded.', '/orders/?id=' || p_order::text);
    end if;
  else
    perform public.recompute_builder_review_stats(v_builder);
    perform public.recompute_builder_rank(v_builder);
  end if;
end;
$$;
revoke all on function public.buyer_confirm_complete(uuid) from public;
grant execute on function public.buyer_confirm_complete(uuid) to authenticated;

create or replace function public.cancel_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_buyer uuid; v_status public.order_status;
  v_studio uuid; v_conv uuid; v_builder uuid; v_moderator uuid;
begin
  select buyer_id, status, studio_id, conversation_id, coalesce(assigned_builder_id, builder_id)
    into v_buyer, v_status, v_studio, v_conv, v_builder
    from public.orders where id = p_order for update;
  if v_buyer is null then raise exception 'Order not found'; end if;
  if v_buyer <> me then raise exception 'Only the buyer can cancel'; end if;
  if v_status not in ('pending_payment', 'paid') then raise exception 'Order can no longer be cancelled'; end if;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order;
  if v_conv is not null then
    insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
    values (
      v_conv, me, 'Order cancelled.', 'order_event',
      jsonb_build_object('event', 'cancelled', 'order_id', p_order)
    );
  end if;
  if v_studio is not null then perform public._release_studio_assignment(p_order, 'cancelled'); end if;
  if v_studio is not null then
    select moderator_id into v_moderator from public.studios where id = v_studio;
    perform public._notify(v_moderator, 'cancelled', 'Studio order cancelled',
      'The buyer cancelled the order.', '/orders/?id=' || p_order::text);
    if v_builder is not null then
      perform public._notify(v_builder, 'cancelled', 'Assigned order cancelled',
        'The buyer cancelled the order.', '/orders/?id=' || p_order::text);
    end if;
  elsif v_builder is not null then
    perform public._notify(v_builder, 'cancelled', 'Order cancelled',
      'The buyer cancelled the order.', '/orders/?id=' || p_order::text);
  end if;
end;
$$;
revoke all on function public.cancel_order(uuid) from public;
grant execute on function public.cancel_order(uuid) to authenticated;

-- ─── Studio reviews ─────────────────────────────────────────────────────────

create or replace function public.leave_review(
  p_order uuid,
  p_rating int,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_buyer uuid; v_builder uuid; v_studio uuid;
  v_status public.order_status; v_body text; v_review uuid; v_target uuid;
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5'; end if;
  v_body := btrim(coalesce(p_body, ''));
  if char_length(v_body) not between 1 and 2000 then raise exception 'Review must be 1-2000 characters'; end if;
  select buyer_id, builder_id, studio_id, status
    into v_buyer, v_builder, v_studio, v_status
    from public.orders where id = p_order for update;
  if v_buyer <> me then raise exception 'Only the buyer can review this order'; end if;
  if v_status <> 'completed' then raise exception 'You can only review a completed order'; end if;
  if exists (select 1 from public.reviews r where r.order_id = p_order) then
    raise exception 'This order has already been reviewed';
  end if;
  insert into public.reviews (order_id, reviewer_id, builder_id, studio_id, rating, body)
  values (p_order, me, v_builder, v_studio, p_rating, v_body)
  returning id into v_review;

  if v_studio is not null then
    update public.studios
       set avg_rating = coalesce((
             select round(avg(r.rating)::numeric, 2) from public.reviews r where r.studio_id = v_studio
           ), 0),
           reviews_count = (select count(*) from public.reviews r where r.studio_id = v_studio)
     where id = v_studio;
    select moderator_id into v_target from public.studios where id = v_studio;
  else
    perform public.recompute_builder_review_stats(v_builder);
    perform public.recompute_builder_rank(v_builder);
    v_target := v_builder;
  end if;
  perform public._notify(v_target, 'review', 'New review received',
    p_rating::text || '-star review: ' || left(v_body, 120),
    '/orders/?id=' || p_order::text);
  return v_review;
end;
$$;
revoke all on function public.leave_review(uuid, int, text) from public;
grant execute on function public.leave_review(uuid, int, text) to authenticated;

-- ─── Inbox with permanent studio identities and per-user read cursors ───────

create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;
drop policy if exists "owner reads conversation cursor" on public.conversation_reads;
create policy "owner reads conversation cursor" on public.conversation_reads for select
  using (user_id = auth.uid());

drop function if exists public.list_my_conversations();
create function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint,
  conversation_type text,
    studio_id uuid,
    studio_slug text,
    assigned_builder_id uuid,
    assigned_builder_name text,
    can_write boolean
)
language sql
security definer
set search_path = public
as $$
  with accessible as (
    select c.*
      from public.conversations c
       where public._can_read_conversation_message(c.id, now())
          or exists (
              select 1
              from public.studio_order_assignments soa
              join public.orders o on o.id = soa.order_id
             where o.conversation_id = c.id
               and soa.builder_id = auth.uid()
          )
  )
  select
    c.id,
    case
      when c.conversation_type = 'direct'
        then case when c.user_a = auth.uid() then c.user_b else c.user_a end
      when c.client_id = auth.uid() then s.moderator_id
      else c.client_id
    end,
    case
      when c.conversation_type = 'direct' then dp.username
      when c.client_id = auth.uid() then s.slug::text
      else cp.username
    end,
    case
      when c.conversation_type = 'direct' then dp.display_name
      when c.client_id = auth.uid() then s.name
      else cp.display_name
    end,
    case
      when c.conversation_type = 'direct' then dp.avatar_url
      when c.client_id = auth.uid() then s.logo_url
      else cp.avatar_url
    end,
      visible_last.body,
      visible_last.created_at,
    (
      select count(*)
        from public.messages m
       where m.conversation_id = c.id
         and m.sender_id <> auth.uid()
         and m.created_at > coalesce((
           select cr.last_read_at from public.conversation_reads cr
            where cr.conversation_id = c.id and cr.user_id = auth.uid()
         ), '-infinity'::timestamptz)
         and public._can_read_conversation_message(c.id, m.created_at)
    ),
    c.conversation_type,
      c.studio_id,
      s.slug::text,
      active_order.assigned_builder_id,
      assigned.display_name,
      public._can_write_conversation(c.id)
  from accessible c
  left join public.profiles dp
    on c.conversation_type = 'direct'
   and dp.id = (case when c.user_a = auth.uid() then c.user_b else c.user_a end)
  left join public.studios s on s.id = c.studio_id
    left join public.profiles cp on cp.id = c.client_id
    left join lateral (
      select m.id, left(
               case
                 when m.msg_type = 'image' then 'Photo'
                 else coalesce(m.body, '')
               end,
               120
             ) as body,
             m.created_at
        from public.messages m
       where m.conversation_id = c.id
         and public._can_read_conversation_message(c.id, m.created_at)
       order by m.created_at desc
       limit 1
    ) visible_last on true
  left join lateral (
    select o.assigned_builder_id
      from public.orders o
     where o.conversation_id = c.id
       and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
     order by o.created_at desc limit 1
  ) active_order on true
  left join public.profiles assigned on assigned.id = active_order.assigned_builder_id
  order by visible_last.created_at desc nulls last, c.created_at desc;
$$;
revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_my_conversations() to authenticated;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public._can_read_conversation_message(conv, now())
       and not exists (
         select 1
           from public.studio_order_assignments soa
           join public.orders o on o.id = soa.order_id
          where o.conversation_id = conv
            and soa.builder_id = auth.uid()
       ) then
    raise exception 'Not a participant';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (conv, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ─── Studio balance and withdrawal requests ─────────────────────────────────

create or replace function public.get_my_studio_payout_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid; v_earned bigint; v_reserved bigint; v_sent bigint;
begin
  select id into v_studio from public.studios where moderator_id = auth.uid();
  if v_studio is null then raise exception 'Studio not found'; end if;
  select coalesce(sum(studio_earnings_kopecks), 0) into v_earned
    from public.orders where studio_id = v_studio and status = 'completed';
  select
    coalesce(sum(amount_cents) filter (where status in ('requested','approved','processing')), 0),
    coalesce(sum(amount_cents) filter (where status = 'sent'), 0)
    into v_reserved, v_sent
    from public.payouts where studio_id = v_studio;
  return jsonb_build_object(
    'studio_id', v_studio,
    'earned_cents', v_earned,
    'pending_cents', v_reserved,
    'withdrawn_cents', v_sent,
    'available_cents', greatest(v_earned - v_reserved - v_sent, 0)
  );
end;
$$;
revoke all on function public.get_my_studio_payout_summary() from public;
grant execute on function public.get_my_studio_payout_summary() to authenticated;

create or replace function public.request_studio_withdrawal(p_amount_cents int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid; v_method text; v_details text; v_summary jsonb; v_id uuid; v_currency text;
begin
  if p_amount_cents < 2000 then raise exception 'Minimum withdrawal is $20.00'; end if;
  select id, payout_method, nullif(btrim(coalesce(payout_details, '')), '')
    into v_studio, v_method, v_details
    from public.studios where moderator_id = auth.uid() for update;
  if v_studio is null then raise exception 'Studio not found'; end if;
  if v_method not in ('usdt_trc20', 'usdt_erc20') or v_details is null then
    raise exception 'Save a supported studio crypto payout destination first';
  end if;
  v_summary := public.get_my_studio_payout_summary();
  if p_amount_cents > (v_summary ->> 'available_cents')::bigint then
    raise exception 'Insufficient studio balance';
  end if;
  v_currency := case when v_method = 'usdt_erc20' then 'usdterc20' else 'usdttrc20' end;
  insert into public.payouts (
    order_id, builder_id, studio_id, amount_cents, currency, destination,
    payout_method, provider, status
  )
  values (
    null, null, v_studio, p_amount_cents, v_currency, v_details,
    v_method, 'manual', 'requested'
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_studio_withdrawal(int) from public;
grant execute on function public.request_studio_withdrawal(int) to authenticated;

create or replace function public.cancel_studio_withdrawal(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payouts p
     set status = 'cancelled'
   where p.id = p_payout
     and p.status = 'requested'
     and exists (
       select 1 from public.studios s
        where s.id = p.studio_id and s.moderator_id = auth.uid()
     );
  if not found then raise exception 'Withdrawal cannot be cancelled'; end if;
end;
$$;
revoke all on function public.cancel_studio_withdrawal(uuid) from public;
grant execute on function public.cancel_studio_withdrawal(uuid) to authenticated;

notify pgrst, 'reload schema';
