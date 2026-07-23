-- =============================================================================
-- BuildEx — managed studios: registration, team access, catalog orders + chat
-- Depends on 0041_managed_studios_core.sql.
-- =============================================================================

-- ─── Shared guards ───────────────────────────────────────────────────────────

create or replace function public._require_buildex_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only a BuildEx moderator can perform this action';
  end if;
end;
$$;
revoke all on function public._require_buildex_admin() from public;

create or replace function public._require_studio_moderator(p_studio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.studios s where s.id = p_studio and s.moderator_id = auth.uid()
  ) then
    raise exception 'Only the studio moderator can perform this action';
  end if;
end;
$$;
revoke all on function public._require_studio_moderator(uuid) from public;

-- ─── BuildEx moderator invitation/admin RPCs ────────────────────────────────

create or replace function public.admin_create_studio_moderator_invite(
  p_internal_name text,
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public._require_buildex_admin();
  if char_length(btrim(coalesce(p_internal_name, ''))) = 0 then
    raise exception 'Internal studio name is required';
  end if;
  if char_length(btrim(coalesce(p_code, ''))) < 6 then
    raise exception 'Moderator code must be at least 6 characters';
  end if;

  insert into public.studio_moderator_invites (internal_name, code, created_by)
  values (btrim(p_internal_name), btrim(p_code), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_studio_moderator_invite(text, text) from public;
grant execute on function public.admin_create_studio_moderator_invite(text, text) to authenticated;

create or replace function public.admin_set_studio_moderator_invite_status(
  p_invite uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_buildex_admin();
  if p_status not in ('pending', 'revoked') then
    raise exception 'Invite status must be pending or revoked';
  end if;
  update public.studio_moderator_invites
     set status = p_status
   where id = p_invite and claimed_at is null;
  if not found then raise exception 'Invite not found or already claimed'; end if;
end;
$$;
revoke all on function public.admin_set_studio_moderator_invite_status(uuid, text) from public;
grant execute on function public.admin_set_studio_moderator_invite_status(uuid, text) to authenticated;

create or replace function public.admin_configure_managed_studio(
  p_studio uuid,
  p_platform_commission_bps int,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- ─── Studio moderator registration ─────────────────────────────────────────

create or replace function public.validate_studio_moderator_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.studio_moderator_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row
    from public.studio_moderator_invites
   where code = btrim(coalesce(p_code, ''))::citext
     and status = 'pending'
     and claimed_at is null;
  if v_row.id is null then raise exception 'That studio moderator code is invalid or already used'; end if;
  return jsonb_build_object('valid', true);
end;
$$;
revoke all on function public.validate_studio_moderator_invite(text) from public;
grant execute on function public.validate_studio_moderator_invite(text) to authenticated;

create or replace function public.complete_studio_registration(
  p_code text,
  p_name text,
  p_username text,
  p_avatar_url text,
  p_rates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_invite public.studio_moderator_invites%rowtype;
  v_studio uuid;
  v_slug citext := lower(btrim(coalesce(p_username, '')))::citext;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Studio name must be between 2 and 80 characters';
  end if;
  if v_slug::text !~ '^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$' then
    raise exception 'Studio username must be 3-24 lowercase letters, numbers, or underscores';
  end if;
  if p_rates is null or jsonb_typeof(p_rates) <> 'object' then
    raise exception 'Studio prices are required';
  end if;
  perform pg_advisory_xact_lock(hashtext(lower(v_slug::text)));
  if exists (select 1 from public.profiles p where lower(p.username) = lower(v_slug::text) and p.id <> me)
     or exists (select 1 from public.studios s where lower(s.slug::text) = lower(v_slug::text)) then
    raise exception 'That username is already taken';
  end if;

  select * into v_invite
    from public.studio_moderator_invites
   where code = btrim(coalesce(p_code, ''))::citext
     and status = 'pending'
     and claimed_at is null
   for update;
  if v_invite.id is null then raise exception 'That studio moderator code is invalid or already used'; end if;
  if exists (select 1 from public.studios s where s.moderator_id = me) then
    raise exception 'This account already manages a studio';
  end if;

  insert into public.studios (
    name, slug, logo_url, moderator_id, rates, status, accepting_orders, claimed_at,
    -- Legacy fields are inert but remain NOT NULL in the 0026 schema.
    studio_share_bps, promo_bps
  )
  values (
    btrim(p_name), v_slug, nullif(btrim(coalesce(p_avatar_url, '')), ''), me,
    p_rates, 'pending', false, now(), 0, 0
  )
  returning id into v_studio;

  insert into public.studio_portfolio_images (studio_id, url, storage_path, position, alt)
  select v_studio, pi.url, pi.storage_path, pi.position, pi.alt
    from public.portfolio_images pi
   where pi.builder_id = me
  on conflict do nothing;

  update public.studio_moderator_invites
     set status = 'claimed', claimed_by = me, studio_id = v_studio, claimed_at = now()
   where id = v_invite.id;

  update public.profiles
     set role = 'studio',
         display_name = btrim(p_name),
         username = v_slug::text,
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         onboarding_completed_at = now()
   where id = me;

  delete from public.builder_profiles where id = me;
  return v_studio;
end;
$$;
revoke all on function public.complete_studio_registration(text, text, text, text, jsonb) from public;
grant execute on function public.complete_studio_registration(text, text, text, text, jsonb) to authenticated;

-- ─── Studio moderator settings and employee codes ──────────────────────────

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
begin
  select id into v_studio from public.studios where moderator_id = me;
  if v_studio is null then raise exception 'Studio not found'; end if;
  if p_employee_commission_bps not between 0 and 10000 then
    raise exception 'Employee commission must be between 0 and 100 percent';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Studio name must be between 2 and 80 characters';
  end if;
  if v_slug::text !~ '^[a-z0-9](?:[a-z0-9_]{1,22}[a-z0-9])$' then
    raise exception 'Studio username must be 3-24 lowercase letters, numbers, or underscores';
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
    select 1 from public.studios s where lower(s.slug::text) = lower(v_slug::text) and s.id <> v_studio
  ) then raise exception 'That username is already taken'; end if;
  if exists (
    select 1 from public.profiles p where lower(p.username) = lower(v_slug::text) and p.id <> me
  ) then raise exception 'That username is already taken'; end if;

  update public.studios
     set name = btrim(p_name),
         slug = v_slug,
         logo_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         rates = coalesce(p_rates, '{}'::jsonb),
         employee_commission_bps = p_employee_commission_bps,
         accepting_orders = p_accepting_orders,
         payout_method = nullif(btrim(coalesce(p_payout_method, '')), ''),
         payout_details = nullif(btrim(coalesce(p_payout_details, '')), '')
   where id = v_studio;

  update public.profiles
     set display_name = btrim(p_name), username = v_slug::text,
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), '')
   where id = me;
end;
$$;
revoke all on function public.update_my_studio(text, text, text, jsonb, int, boolean, text, text) from public;
grant execute on function public.update_my_studio(text, text, text, jsonb, int, boolean, text, text) to authenticated;

create or replace function public.create_studio_employee_code(
  p_code text,
  p_max_redemptions int,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid; v_id uuid;
begin
  select id into v_studio
    from public.studios
   where moderator_id = auth.uid() and employee_commission_bps is not null;
  if v_studio is null then
    raise exception 'Set the studio employee commission before generating codes';
  end if;
  if char_length(btrim(coalesce(p_code, ''))) < 6 then
    raise exception 'Employee code must be at least 6 characters';
  end if;
  if p_max_redemptions not between 1 and 1000 then
    raise exception 'Redemption limit must be between 1 and 1000';
  end if;
  insert into public.studio_employee_codes (studio_id, code, max_redemptions, expires_at)
  values (v_studio, btrim(p_code), p_max_redemptions, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_studio_employee_code(text, int, timestamptz) from public;
grant execute on function public.create_studio_employee_code(text, int, timestamptz) to authenticated;

create or replace function public.set_studio_employee_code_status(p_code_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('active', 'disabled') then raise exception 'Invalid code status'; end if;
  update public.studio_employee_codes c
     set status = p_status
   where c.id = p_code_id
     and exists (
       select 1 from public.studios s where s.id = c.studio_id and s.moderator_id = auth.uid()
     );
  if not found then raise exception 'Employee code not found'; end if;
end;
$$;
revoke all on function public.set_studio_employee_code_status(uuid, text) from public;
grant execute on function public.set_studio_employee_code_status(uuid, text) to authenticated;

-- ─── Employee registration and availability ────────────────────────────────

create or replace function public.validate_studio_employee_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'studio_id', s.id, 'name', s.name, 'logo_url', s.logo_url
  ) into v_result
    from public.studio_employee_codes c
    join public.studios s on s.id = c.studio_id
   where c.code = btrim(coalesce(p_code, ''))::citext
     and c.status = 'active'
     and s.status in ('pending', 'active')
     and (c.expires_at is null or c.expires_at > now())
     and c.redemptions_used < c.max_redemptions;
  if v_result is null then raise exception 'That employee code is invalid, expired, or full'; end if;
  return v_result;
end;
$$;
revoke all on function public.validate_studio_employee_code(text) from public;
grant execute on function public.validate_studio_employee_code(text) to authenticated;

create or replace function public.complete_studio_employee_registration(
  p_code text,
  p_display_name text,
  p_username text,
  p_avatar_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code public.studio_employee_codes%rowtype;
  v_membership uuid;
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 2 and 32 then
    raise exception 'Display name must be between 2 and 32 characters';
  end if;
  if v_username !~ '^[a-z0-9](?:[a-z0-9_]){2,23}$' then
    raise exception 'Username must be 3-24 lowercase letters, numbers, or underscores';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = v_username and p.id <> me) then
    raise exception 'That username is already taken';
  end if;
  if exists (select 1 from public.studio_memberships m where m.builder_id = me and m.status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;

  select c.* into v_code
    from public.studio_employee_codes c
    join public.studios s on s.id = c.studio_id
   where c.code = btrim(coalesce(p_code, ''))::citext
     and c.status = 'active'
     and s.status in ('pending', 'active')
     and (c.expires_at is null or c.expires_at > now())
   for update of c;
  if v_code.id is null or v_code.redemptions_used >= v_code.max_redemptions then
    raise exception 'That employee code is invalid, expired, or full';
  end if;

  update public.studio_employee_codes
     set redemptions_used = redemptions_used + 1
   where id = v_code.id and redemptions_used < max_redemptions;
  if not found then raise exception 'That employee code is full'; end if;

  update public.profiles
     set role = 'builder', display_name = btrim(p_display_name),
         username = v_username,
         avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
         onboarding_completed_at = now()
   where id = me;

  insert into public.builder_profiles (
    id, profile_type, studio_id, availability_status, is_available,
    specialties, build_types, tools, rates
  )
  values (
    me, 'studio_employee', v_code.studio_id, 'available', true,
    '{}', '{}', '{}', '{}'::jsonb
  )
  on conflict (id) do update
    set profile_type = 'studio_employee', studio_id = excluded.studio_id,
        availability_status = 'available', is_available = true,
        pending_employee_code = null;

  insert into public.studio_memberships (studio_id, builder_id)
  values (v_code.studio_id, me)
  returning id into v_membership;
  return v_membership;
end;
$$;
revoke all on function public.complete_studio_employee_registration(text, text, text, text) from public;
grant execute on function public.complete_studio_employee_registration(text, text, text, text) to authenticated;

create or replace function public.set_my_studio_availability(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('available', 'busy') then raise exception 'Invalid availability'; end if;
  if exists (
    select 1 from public.studio_order_assignments a
     where a.builder_id = auth.uid() and a.released_at is null
  ) then raise exception 'Availability is controlled by your active order'; end if;
  update public.studio_memberships
     set availability_status = p_status,
         busy_source = case when p_status = 'busy' then 'manual' else null end
   where builder_id = auth.uid() and status = 'active';
  if not found then raise exception 'Active studio membership not found'; end if;
  update public.builder_profiles
     set availability_status = p_status, is_available = (p_status = 'available')
   where id = auth.uid() and profile_type = 'studio_employee';
end;
$$;
revoke all on function public.set_my_studio_availability(text) from public;
grant execute on function public.set_my_studio_availability(text) to authenticated;

create or replace function public.remove_studio_employee(p_builder uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_studio uuid;
begin
  select id into v_studio from public.studios where moderator_id = auth.uid();
  if v_studio is null then raise exception 'Studio not found'; end if;
  if exists (
    select 1 from public.studio_order_assignments a
     where a.studio_id = v_studio and a.builder_id = p_builder and a.released_at is null
  ) then raise exception 'Reassign or finish this employee''s active order first'; end if;
  update public.studio_memberships
     set status = 'removed', removed_at = now(), availability_status = 'busy', busy_source = null
   where studio_id = v_studio and builder_id = p_builder and status = 'active';
  if not found then raise exception 'Active employee not found'; end if;
  update public.builder_profiles set studio_id = null where id = p_builder;
end;
$$;
revoke all on function public.remove_studio_employee(uuid) from public;
grant execute on function public.remove_studio_employee(uuid) to authenticated;

-- ─── Conversation access helpers and policies ───────────────────────────────

create or replace function public._can_read_conversation_message(
  p_conversation uuid,
  p_message_created_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation
       and (
         (
           c.conversation_type = 'direct'
           and auth.uid() in (c.user_a, c.user_b)
         )
         or
         (
           c.conversation_type = 'studio_client'
           and (
             c.client_id = auth.uid()
             or exists (
               select 1 from public.studios s
                where s.id = c.studio_id and s.moderator_id = auth.uid()
             )
             or exists (
               select 1
                 from public.orders o
                 join public.studio_order_assignments a on a.order_id = o.id
                where o.conversation_id = c.id
                  and a.builder_id = auth.uid()
                  and (
                    a.released_at is null
                    or p_message_created_at <= a.released_at
                  )
             )
           )
         )
       )
  );
$$;
revoke all on function public._can_read_conversation_message(uuid, timestamptz) from public;
grant execute on function public._can_read_conversation_message(uuid, timestamptz) to authenticated;

create or replace function public._can_write_conversation(p_conversation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation
       and (
         (c.conversation_type = 'direct' and auth.uid() in (c.user_a, c.user_b))
         or (
           c.conversation_type = 'studio_client'
           and (
             c.client_id = auth.uid()
             or exists (
               select 1 from public.studios s
                where s.id = c.studio_id and s.moderator_id = auth.uid()
             )
             or exists (
               select 1
                 from public.orders o
                 join public.studio_order_assignments a on a.order_id = o.id
                where o.conversation_id = c.id
                  and a.builder_id = auth.uid()
                  and a.released_at is null
                  and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
             )
           )
         )
       )
  );
$$;
revoke all on function public._can_write_conversation(uuid) from public;
grant execute on function public._can_write_conversation(uuid) to authenticated;

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
  on public.conversations for select
  using (public._can_read_conversation_message(id, now()));

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  using (public._can_read_conversation_message(conversation_id, created_at));

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id and public._can_write_conversation(conversation_id));

create or replace function public._ensure_studio_conversation(
  p_studio uuid,
  p_client uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_conv uuid;
begin
  insert into public.conversations (
    conversation_type, studio_id, client_id, user_a, user_b
  )
  values ('studio_client', p_studio, p_client, null, null)
  on conflict (studio_id, client_id) where conversation_type = 'studio_client' do nothing;
  select id into v_conv
    from public.conversations
   where conversation_type = 'studio_client'
     and studio_id = p_studio and client_id = p_client;
  return v_conv;
end;
$$;
revoke all on function public._ensure_studio_conversation(uuid, uuid) from public;

create or replace function public.get_or_create_studio_conversation(p_studio uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_conv uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.studios s where s.id = p_studio and s.status = 'active') then
    raise exception 'Studio not found';
  end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'studio') then
    raise exception 'Studio accounts cannot contact or hire another studio';
  end if;
  v_conv := public._ensure_studio_conversation(p_studio, auth.uid());
  return v_conv;
end;
$$;
revoke all on function public.get_or_create_studio_conversation(uuid) from public;
grant execute on function public.get_or_create_studio_conversation(uuid) to authenticated;

-- ─── Studio order placement ─────────────────────────────────────────────────

create or replace function public.place_studio_order(
  p_studio uuid,
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
  v_fee_bps int;
  v_price int;
  v_commission int;
  v_net int;
  v_label text;
  v_conv uuid;
  v_order uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.profiles p where p.id = me and p.role = 'studio') then
    raise exception 'Studio accounts cannot place orders';
  end if;
  if p_style is null or char_length(btrim(p_style)) = 0 then raise exception 'Style is required'; end if;
  if char_length(btrim(coalesce(p_brief, ''))) < 20 then raise exception 'Brief must be at least 20 characters'; end if;

  select rates, platform_commission_bps
    into v_rates, v_fee_bps
    from public.studios
   where id = p_studio and status = 'active' and accepting_orders
     and moderator_id <> me;
  if v_rates is null or v_fee_bps is null then
    raise exception 'This studio is not accepting paid orders';
  end if;
  if not exists (
    select 1 from public.studio_memberships m
     where m.studio_id = p_studio and m.status = 'active'
       and m.availability_status = 'available'
  ) then raise exception 'This studio has no available employees'; end if;
  if exists (
    select 1 from public.orders o
     where o.buyer_id = me and o.studio_id = p_studio
       and o.status in ('pending_payment', 'paid', 'in_progress', 'delivered', 'disputed')
  ) then raise exception 'Finish or cancel your current order with this studio first'; end if;

  v_tier := v_rates -> p_size;
  if v_tier is null or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Studio does not offer this size';
  end if;
  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price < 2000 then
    raise exception 'Minimum BuildEx order price is $20.00';
  end if;
  v_label := nullif(btrim(coalesce(v_tier ->> 'label', '')), '');
  v_commission := (v_price * v_fee_bps) / 10000;
  v_net := v_price - v_commission;
  v_conv := public._ensure_studio_conversation(p_studio, me);

  insert into public.orders (
    buyer_id, builder_id, studio_id, building_size, size_label, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks,
    platform_commission_bps_snapshot, studio_earnings_kopecks,
    conversation_id, status
  )
  values (
    me, null, p_studio, p_size, v_label, btrim(p_style), btrim(p_brief),
    v_price, v_commission, 0, v_fee_bps, v_net, v_conv, 'pending_payment'
  )
  returning id into v_order;
  return v_order;
end;
$$;
revoke all on function public.place_studio_order(uuid, text, text, text) from public;
grant execute on function public.place_studio_order(uuid, text, text, text) to authenticated;

-- Independent-builder placement must reject employee profiles even if someone
-- bypasses the catalog and calls the legacy RPC directly.
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
  v_rates jsonb; v_tier jsonb; v_specialties text[]; v_rank text;
  v_price int; v_commission int; v_earnings int; v_commission_bps int;
  v_label text; v_order_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_builder is null or p_builder = me then raise exception 'Invalid builder'; end if;
  if exists (select 1 from public.profiles p where p.id = me and p.role = 'studio') then
    raise exception 'Studio accounts cannot place orders';
  end if;
  if char_length(btrim(coalesce(p_style, ''))) = 0 then raise exception 'Style is required'; end if;
  if char_length(btrim(coalesce(p_brief, ''))) = 0 then raise exception 'Brief is required'; end if;

  select rates, specialties, rank into v_rates, v_specialties, v_rank
    from public.builder_profiles
   where id = p_builder and profile_type = 'independent';
  if v_rates is null then raise exception 'Independent builder not found'; end if;
  v_tier := v_rates -> p_size;
  if v_tier is null or coalesce((v_tier ->> 'enabled')::boolean, false) is not true then
    raise exception 'Builder does not offer this size';
  end if;
  v_price := nullif(v_tier ->> 'price', '')::int;
  if v_price is null or v_price < 2000 then raise exception 'Minimum BuildEx order price is $20.00'; end if;
  if v_specialties is null or not (p_style = any(v_specialties)) then
    raise exception 'Style not offered by builder';
  end if;
  v_label := nullif(btrim(coalesce(v_tier ->> 'label', '')), '');
  v_commission_bps := public.commission_bps_for_rank(coalesce(v_rank, 'rookie'));
  v_commission := (v_price * v_commission_bps) / 10000;
  v_earnings := v_price - v_commission;
  insert into public.orders (
    buyer_id, builder_id, building_size, size_label, style, brief,
    price_kopecks, commission_kopecks, builder_earnings_kopecks, status
  )
  values (
    me, p_builder, p_size, v_label, p_style, p_brief,
    v_price, v_commission, v_earnings, 'pending_payment'
  )
  returning id into v_order_id;
  return v_order_id;
end;
$$;
revoke all on function public.place_order(uuid, text, text, text) from public;
grant execute on function public.place_order(uuid, text, text, text) to authenticated;

-- ─── Assignment and reassignment ────────────────────────────────────────────

create or replace function public.assign_studio_order(
  p_order uuid,
  p_builder uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid; v_status public.order_status; v_old_builder uuid;
  v_employee_bps int; v_conv uuid; v_name text; v_buyer uuid;
begin
  select o.studio_id, o.status, o.assigned_builder_id, o.conversation_id, o.buyer_id
    into v_studio, v_status, v_old_builder, v_conv, v_buyer
    from public.orders o where o.id = p_order for update;
  if v_studio is null then raise exception 'Studio order not found'; end if;
  perform public._require_studio_moderator(v_studio);
  if v_status not in ('paid', 'in_progress') then
    raise exception 'Orders can only be assigned before delivery';
  end if;
  if v_old_builder = p_builder then return; end if;
  select employee_commission_bps into v_employee_bps
    from public.studios where id = v_studio;
  if v_employee_bps is null then raise exception 'Set the employee commission first'; end if;
  if not exists (
    select 1 from public.studio_memberships m
     where m.studio_id = v_studio and m.builder_id = p_builder
       and m.status = 'active' and m.availability_status = 'available'
  ) then raise exception 'Employee is not available'; end if;

  if v_old_builder is not null then
    update public.studio_order_assignments
       set released_at = now(), release_reason = 'reassigned'
     where order_id = p_order and released_at is null;
    update public.studio_memberships
       set availability_status = 'available', busy_source = null
     where studio_id = v_studio and builder_id = v_old_builder and status = 'active';
    update public.builder_profiles
       set availability_status = 'available', is_available = true
     where id = v_old_builder;
    perform public._notify(
      v_old_builder, 'reassigned', 'Studio order reassigned',
      'You have been released from this order. Your chat archive is now read-only.',
      '/orders/?id=' || p_order::text
    );
  end if;

  insert into public.studio_order_assignments (
    order_id, studio_id, builder_id, employee_commission_bps
  ) values (p_order, v_studio, p_builder, v_employee_bps);
  update public.orders
     set assigned_builder_id = p_builder,
         employee_commission_bps_snapshot = v_employee_bps,
         employee_owed_kopecks = (coalesce(studio_earnings_kopecks, 0) * v_employee_bps) / 10000
   where id = p_order;
  update public.studio_memberships
     set availability_status = 'busy', busy_source = 'order'
   where studio_id = v_studio and builder_id = p_builder and status = 'active';
  update public.builder_profiles
     set availability_status = 'busy', is_available = false
   where id = p_builder;

  select coalesce(display_name, username, 'Builder') into v_name
    from public.profiles where id = p_builder;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    v_conv, auth.uid(),
    case when v_old_builder is null
      then v_name || ' has been assigned to this order.'
      else 'The order has been reassigned to ' || v_name || '.'
    end,
    'order_event',
    jsonb_build_object(
      'event', case when v_old_builder is null then 'assigned' else 'reassigned' end,
      'order_id', p_order, 'assigned_builder_id', p_builder,
      'assigned_builder_name', v_name
    )
  );
  perform public._notify(
    p_builder, 'assigned', 'New studio order assigned',
    'You are now responsible for this client order.',
    '/orders/?id=' || p_order::text
  );
  perform public._notify(
    v_buyer,
    case when v_old_builder is null then 'assigned' else 'reassigned' end,
    case when v_old_builder is null then 'Builder assigned' else 'Builder changed' end,
    v_name || ' is now handling your studio order.',
    '/orders/?id=' || p_order::text
  );
end;
$$;
revoke all on function public.assign_studio_order(uuid, uuid) from public;
grant execute on function public.assign_studio_order(uuid, uuid) to authenticated;

-- ─── Read policies for studio order participants ────────────────────────────

drop policy if exists "participants read orders" on public.orders;
create policy "participants read orders"
  on public.orders for select
  using (
    auth.uid() = buyer_id
    or auth.uid() = builder_id
    or auth.uid() = assigned_builder_id
    or exists (
      select 1 from public.studios s where s.id = orders.studio_id and s.moderator_id = auth.uid()
    )
    or exists (
      select 1 from public.studio_order_assignments a
       where a.order_id = orders.id and a.builder_id = auth.uid()
    )
  );

drop policy if exists "participants read payments" on public.payments;
create policy "participants read payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders o
       where o.id = payments.order_id
         and (
           o.buyer_id = auth.uid()
           or o.builder_id = auth.uid()
           or o.assigned_builder_id = auth.uid()
           or exists (
             select 1 from public.studios s where s.id = o.studio_id and s.moderator_id = auth.uid()
           )
         )
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

notify pgrst, 'reload schema';
