-- Managed studios: close the remaining legacy builder-only delivery/dispute paths.

drop policy if exists "participants and admins read disputes" on public.disputes;
create policy "participants and admins read disputes"
  on public.disputes for select to authenticated
  using (
    exists (
      select 1
        from public.orders o
        left join public.studios s on s.id = o.studio_id
       where o.id = disputes.order_id
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or s.moderator_id = auth.uid()
         )
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

create or replace function public.tag_studio_message_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations%rowtype;
  v_role text;
  v_name text;
begin
  select * into v_conversation
    from public.conversations where id = new.conversation_id;
  if v_conversation.conversation_type <> 'studio_client' then return new; end if;

  select coalesce(display_name, username, 'BuildEx user')
    into v_name from public.profiles where id = new.sender_id;
  if new.sender_id = v_conversation.client_id then
    v_role := 'buyer';
  elsif exists (
    select 1 from public.studios s
     where s.id = v_conversation.studio_id and s.moderator_id = new.sender_id
  ) then
    v_role := 'studio_moderator';
  elsif exists (
    select 1
      from public.orders o
      join public.studio_order_assignments a on a.order_id = o.id
     where o.conversation_id = new.conversation_id
       and a.builder_id = new.sender_id
       and a.released_at is null
  ) then
    v_role := 'assigned_builder';
  else
    v_role := 'studio_team';
  end if;
  new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object(
    'sender_role', v_role,
    'sender_name', coalesce(v_name, 'BuildEx user')
  );
  return new;
end;
$$;
revoke all on function public.tag_studio_message_sender() from public;

drop trigger if exists messages_tag_studio_sender on public.messages;
create trigger messages_tag_studio_sender
  before insert on public.messages
  for each row execute function public.tag_studio_message_sender();

-- The studio-aware response adds an OUT column. PostgreSQL cannot alter a
-- function's TABLE return type in place, so remove the previous RPC first.
drop function if exists public.get_delivery_info(uuid);

create function public.get_delivery_info(p_order uuid)
returns table (
  storage_path text,
  file_name text,
  size_bytes bigint,
  note text,
  created_at timestamptz,
  order_status public.order_status,
  is_buyer boolean,
  is_builder boolean,
  unlocked boolean,
  preview_path text,
  preview_meta jsonb,
  preview_available boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_buyer uuid;
  v_builder uuid;
  v_studio uuid;
  v_moderator uuid;
  v_status public.order_status;
begin
  select o.buyer_id, coalesce(o.assigned_builder_id, o.builder_id),
         o.studio_id, o.status, s.moderator_id
    into v_buyer, v_builder, v_studio, v_status, v_moderator
    from public.orders o
    left join public.studios s on s.id = o.studio_id
   where o.id = p_order;

  if v_buyer is null then raise exception 'Order not found'; end if;
  if me is distinct from v_buyer
     and me is distinct from v_builder
     and me is distinct from v_moderator then
    raise exception 'Not a party to this order';
  end if;

  return query
    select d.storage_path, d.file_name, d.size_bytes, d.note, d.created_at,
           v_status,
           me = v_buyer,
           me = v_builder,
           me = v_builder or me = v_moderator
             or (me = v_buyer and v_status = 'completed'),
           d.preview_path, d.preview_meta, d.preview_path is not null
      from public.order_deliveries d
     where d.order_id = p_order;
end;
$$;
revoke all on function public.get_delivery_info(uuid) from public;
grant execute on function public.get_delivery_info(uuid) to authenticated;

drop policy if exists "order_previews: builder mutates own pre-delivery" on storage.objects;
drop policy if exists "order_previews: assigned builder mutates pre-delivery" on storage.objects;
create policy "order_previews: assigned builder mutates pre-delivery"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  )
  with check (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

drop policy if exists "order_previews: builder removes own pre-delivery" on storage.objects;
drop policy if exists "order_previews: assigned builder removes pre-delivery" on storage.objects;
create policy "order_previews: assigned builder removes pre-delivery"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'order_previews'
    and exists (
      select 1 from public.orders o
       where o.id::text = (storage.foldername(name))[1]
         and coalesce(o.assigned_builder_id, o.builder_id) = auth.uid()
         and o.status = 'in_progress'
    )
  );

create or replace function public.open_dispute(p_order uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_order public.orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if v_reason is null then raise exception 'A reason is required to open a dispute'; end if;
  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.buyer_id <> me then raise exception 'Only the buyer can open a dispute'; end if;
  if v_order.status <> 'delivered' then
    raise exception 'A dispute can only be opened on a delivered order';
  end if;
  if exists (select 1 from public.disputes where order_id = p_order) then
    raise exception 'A dispute has already been opened for this order';
  end if;

  update public.orders set status = 'disputed' where id = p_order;
  insert into public.disputes (order_id, opened_by, reason, status)
  values (p_order, me, v_reason, 'open') returning id into v_dispute;

  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_order.conversation_id, me,
    'Buyer opened a dispute — the BuildEx team will review the delivery.',
    'order_event', jsonb_build_object('event', 'disputed', 'order_id', p_order)
  );
  if v_order.studio_id is not null then
    perform public._notify(
      (select moderator_id from public.studios where id = v_order.studio_id),
      'disputed', 'Studio order disputed',
      'The buyer opened a dispute.', '/orders/?id=' || p_order::text
    );
    if v_order.assigned_builder_id is not null then
      perform public._notify(v_order.assigned_builder_id, 'disputed', 'Order disputed',
        'The buyer opened a dispute.', '/orders/?id=' || p_order::text);
    end if;
  elsif v_order.builder_id is not null then
    perform public._notify(v_order.builder_id, 'disputed', 'Order disputed',
      'The buyer opened a dispute.', '/orders/?id=' || p_order::text);
  end if;
  return v_dispute;
end;
$$;
revoke all on function public.open_dispute(uuid, text) from public;
grant execute on function public.open_dispute(uuid, text) to authenticated;

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
  v_order public.orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_moderator uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = me and p.is_admin
  ) then raise exception 'Only an admin can resolve disputes'; end if;
  if p_outcome not in ('release', 'refund') then
    raise exception 'Outcome must be release or refund';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.status <> 'disputed' then raise exception 'Order is not under dispute'; end if;
  if not exists (
    select 1 from public.disputes where order_id = p_order and status = 'open'
  ) then raise exception 'No open dispute for this order'; end if;

  if p_outcome = 'release' then
    update public.orders set status = 'completed', completed_at = now() where id = p_order;
    update public.disputes
       set status = 'resolved_release', resolution_note = v_note,
           resolved_by = me, resolved_at = now()
     where order_id = p_order;
    insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
    values (
      v_order.conversation_id, me,
      'Dispute resolved — payment released and the order completed.',
      'order_event', jsonb_build_object('event', 'dispute_released', 'order_id', p_order)
    );
    if v_order.studio_id is not null then
      perform public._accrue_managed_studio_order(p_order);
      perform public._release_studio_assignment(p_order, 'dispute_release');
      update public.studios
         set completed_orders = (
           select count(*) from public.orders o
            where o.studio_id = v_order.studio_id and o.status = 'completed'
         )
       where id = v_order.studio_id;
    else
      perform public.recompute_builder_review_stats(v_order.builder_id);
      perform public.recompute_builder_rank(v_order.builder_id);
    end if;
  else
    update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order;
    update public.disputes
       set status = 'resolved_refund', resolution_note = v_note,
           resolved_by = me, resolved_at = now()
     where order_id = p_order;
    insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
    values (
      v_order.conversation_id, me,
      'Dispute resolved — the buyer was refunded and the order cancelled.',
      'order_event', jsonb_build_object('event', 'dispute_refunded', 'order_id', p_order)
    );
    if v_order.studio_id is not null then
      perform public._release_studio_assignment(p_order, 'dispute_refund');
    end if;
  end if;

  if v_order.studio_id is not null then
    select moderator_id into v_moderator from public.studios where id = v_order.studio_id;
    perform public._notify(v_moderator, 'dispute_resolved', 'Dispute resolved',
      case when p_outcome = 'release' then 'Payment was released.' else 'The buyer was refunded.' end,
      '/orders/?id=' || p_order::text);
    if v_order.assigned_builder_id is not null then
      perform public._notify(v_order.assigned_builder_id, 'dispute_resolved', 'Dispute resolved',
        case when p_outcome = 'release' then 'Payment was released.' else 'The buyer was refunded.' end,
        '/orders/?id=' || p_order::text);
    end if;
  elsif v_order.builder_id is not null then
    perform public._notify(v_order.builder_id, 'dispute_resolved', 'Dispute resolved',
      case when p_outcome = 'release' then 'Payment was released.' else 'The buyer was refunded.' end,
      '/orders/?id=' || p_order::text);
  end if;
end;
$$;
revoke all on function public.resolve_dispute(uuid, text, text) from public;
grant execute on function public.resolve_dispute(uuid, text, text) to authenticated;

-- This response removes the legacy size_label field, which changes the
-- function's TABLE return type and therefore requires a drop/recreate.
drop function if exists public.list_open_disputes();

create function public.list_open_disputes()
returns table (
  dispute_id uuid,
  order_id uuid,
  reason text,
  opened_at timestamptz,
  building_size text,
  style text,
  brief text,
  price_kopecks int,
  buyer_id uuid,
  buyer_username text,
  buyer_display_name text,
  builder_id uuid,
  builder_username text,
  builder_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then return; end if;
  return query
    select d.id, d.order_id, d.reason, d.created_at,
           o.building_size, o.style, o.brief, o.price_kopecks,
           buyer.id, buyer.username, buyer.display_name,
           coalesce(provider.id, s.moderator_id),
           coalesce(provider.username, s.slug::text),
           coalesce(provider.display_name, s.name)
      from public.disputes d
      join public.orders o on o.id = d.order_id
      join public.profiles buyer on buyer.id = o.buyer_id
      left join public.profiles provider on provider.id = o.builder_id
      left join public.studios s on s.id = o.studio_id
     where d.status = 'open'
     order by d.created_at;
end;
$$;
revoke all on function public.list_open_disputes() from public;
grant execute on function public.list_open_disputes() to authenticated;

create or replace function public.admin_list_studio_balances()
returns table (
  studio_id uuid,
  earned_cents bigint,
  pending_cents bigint,
  withdrawn_cents bigint,
  available_cents bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_buildex_admin();
  return query
    select s.id,
           coalesce(o.earned, 0),
           coalesce(p.pending, 0),
           coalesce(p.sent, 0),
           greatest(coalesce(o.earned, 0) - coalesce(p.pending, 0) - coalesce(p.sent, 0), 0)
      from public.studios s
      left join lateral (
        select sum(ord.studio_earnings_kopecks)::bigint as earned
          from public.orders ord
         where ord.studio_id = s.id and ord.status = 'completed'
      ) o on true
      left join lateral (
        select
          sum(po.amount_cents) filter (
            where po.status in ('requested', 'approved', 'processing')
          )::bigint as pending,
          sum(po.amount_cents) filter (where po.status = 'sent')::bigint as sent
          from public.payouts po
         where po.studio_id = s.id
      ) p on true;
end;
$$;
revoke all on function public.admin_list_studio_balances() from public;
grant execute on function public.admin_list_studio_balances() to authenticated;

create or replace function public.admin_recover_studio_owner(
  p_studio uuid,
  p_new_moderator uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old uuid;
begin
  perform public._require_buildex_admin();
  if not exists (select 1 from public.profiles p where p.id = p_new_moderator) then
    raise exception 'Replacement account not found';
  end if;
  if exists (
    select 1 from public.studios s
     where s.moderator_id = p_new_moderator and s.id <> p_studio
  ) then raise exception 'Replacement account already manages a studio'; end if;

  select moderator_id into v_old from public.studios where id = p_studio for update;
  if not found then raise exception 'Studio not found'; end if;
  update public.studios set moderator_id = p_new_moderator where id = p_studio;
  update public.profiles set role = 'client' where id = v_old and role = 'studio';
  update public.profiles
     set role = 'studio', onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_new_moderator;
end;
$$;
revoke all on function public.admin_recover_studio_owner(uuid, uuid) from public;
grant execute on function public.admin_recover_studio_owner(uuid, uuid) to authenticated;

create or replace function public.get_my_managed_studio()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare v_result jsonb;
begin
  select to_jsonb(s) || jsonb_build_object(
           'portfolio',
           coalesce((
             select jsonb_agg(to_jsonb(pi) order by pi.position, pi.created_at)
               from public.studio_portfolio_images pi
              where pi.studio_id = s.id
           ), '[]'::jsonb)
         )
    into v_result
    from public.studios s
   where s.moderator_id = auth.uid();
  return v_result;
end;
$$;
revoke all on function public.get_my_managed_studio() from public;
grant execute on function public.get_my_managed_studio() to authenticated;

create or replace function public.admin_list_managed_studios()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare v_result jsonb;
begin
  perform public._require_buildex_admin();
  select coalesce(
           jsonb_agg(
             to_jsonb(s) || jsonb_build_object(
               'moderator',
               case when p.id is null then null else jsonb_build_object(
                 'id', p.id,
                 'username', p.username,
                 'display_name', p.display_name,
                 'avatar_url', p.avatar_url
               ) end
             )
             order by s.created_at desc
           ),
           '[]'::jsonb
         )
    into v_result
    from public.studios s
    left join public.profiles p on p.id = s.moderator_id
   where s.moderator_id is not null;
  return v_result;
end;
$$;
revoke all on function public.admin_list_managed_studios() from public;
grant execute on function public.admin_list_managed_studios() to authenticated;

-- Public catalog consumers receive storefront fields only. Commission,
-- ownership and payout destination fields are available solely through the
-- guarded moderator/admin RPCs above.
revoke select on public.studios from anon, authenticated;
grant select (
  id, name, slug, logo_url, bio, status, rates, accepting_orders,
  available_employees, avg_rating, reviews_count, completed_orders,
  created_at, claimed_at
) on public.studios to anon, authenticated;

notify pgrst, 'reload schema';
