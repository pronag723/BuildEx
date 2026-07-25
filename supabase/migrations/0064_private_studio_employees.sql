-- Studio employees are private team members: studios own customer pricing and
-- employee direct messages are limited to their own moderator and platform
-- administrators. These checks live in the database so browser UI changes
-- cannot bypass them.

create or replace function public.is_active_studio_employee(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.studio_memberships m
     where m.builder_id = p_user and m.status = 'active'
  );
$$;
revoke all on function public.is_active_studio_employee(uuid) from public;
grant execute on function public.is_active_studio_employee(uuid) to authenticated;

-- A direct thread involving an active employee is permitted only between that
-- employee and their studio moderator or a platform administrator.
create or replace function public.can_direct_message(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      not public.is_active_studio_employee(p_user_a)
      or exists (select 1 from public.profiles p where p.id = p_user_b and p.is_admin)
      or exists (
        select 1
          from public.studio_memberships m
          join public.studios s on s.id = m.studio_id
         where m.builder_id = p_user_a
           and m.status = 'active'
           and s.moderator_id = p_user_b
      )
    )
    and
    (
      not public.is_active_studio_employee(p_user_b)
      or exists (select 1 from public.profiles p where p.id = p_user_a and p.is_admin)
      or exists (
        select 1
          from public.studio_memberships m
          join public.studios s on s.id = m.studio_id
         where m.builder_id = p_user_b
           and m.status = 'active'
           and s.moderator_id = p_user_a
      )
    );
$$;
revoke all on function public.can_direct_message(uuid, uuid) from public;
grant execute on function public.can_direct_message(uuid, uuid) to authenticated;

-- Remove legacy independent prices from employees who joined before this
-- migration. Future client-side writes are rejected below as a second layer of
-- protection beyond the hidden account control.
update public.builder_profiles bp
   set rates = '{}'::jsonb,
       profile_type = 'studio_employee',
       studio_id = m.studio_id
  from public.studio_memberships m
 where m.builder_id = bp.id and m.status = 'active';

create or replace function public.prevent_studio_employee_rate_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rates is distinct from old.rates
     and public.is_active_studio_employee(new.id) then
    raise exception 'Studio employees cannot set independent rates';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_profiles_block_employee_rate_edits on public.builder_profiles;
create trigger builder_profiles_block_employee_rate_edits
  before update of rates on public.builder_profiles
  for each row execute function public.prevent_studio_employee_rate_edits();

create or replace function public.prevent_active_employee_public_profile_edits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_active_studio_employee(new.id)
     and (new.profile_type is distinct from 'studio_employee' or new.studio_id is null) then
    raise exception 'An active studio employee cannot be made an independent public builder';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_profiles_keep_active_employees_private on public.builder_profiles;
create trigger builder_profiles_keep_active_employees_private
  before update of profile_type, studio_id on public.builder_profiles
  for each row execute function public.prevent_active_employee_public_profile_edits();

create or replace function public.get_or_create_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  lo uuid;
  hi uuid;
  conv uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if other is null or other = me then raise exception 'Invalid recipient'; end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'Recipient not found';
  end if;
  if not public.can_direct_message(me, other) then
    raise exception 'Direct messaging is restricted for this studio employee';
  end if;

  if me < other then lo := me; hi := other; else lo := other; hi := me; end if;
  insert into public.conversations (user_a, user_b)
  values (lo, hi)
  on conflict (user_a, user_b) do nothing;
  select id into conv from public.conversations where user_a = lo and user_b = hi;
  return conv;
end;
$$;
revoke all on function public.get_or_create_conversation(uuid) from public;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

create or replace function public.respond_to_studio_builder_invitation(
  p_invitation uuid,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_inv public.studio_builder_invitations%rowtype;
  v_status text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_response not in ('accept', 'decline') then raise exception 'Invalid invitation response'; end if;
  select * into v_inv from public.studio_builder_invitations
   where id = p_invitation and builder_id = me for update;
  if v_inv.id is null or v_inv.status <> 'pending' then raise exception 'Invitation is no longer pending'; end if;
  if p_response = 'decline' then
    update public.studio_builder_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
    return;
  end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then raise exception 'This account already belongs to a studio'; end if;
  select availability_status into v_status from public.builder_profiles where id = me;
  v_status := case when v_status = 'available' then 'available' else 'busy' end;
  update public.builder_profiles
     set profile_type = 'studio_employee', studio_id = v_inv.studio_id,
         rates = '{}'::jsonb, availability_status = v_status,
         is_available = (v_status = 'available')
   where id = me and profile_type = 'independent';
  if not found then raise exception 'Only an independent builder can accept this invitation'; end if;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source)
  values (v_inv.studio_id, me, v_status, case when v_status = 'busy' then 'manual' else null end);
  update public.studio_builder_invitations set status = 'accepted', responded_at = now() where id = v_inv.id;
end;
$$;
revoke all on function public.respond_to_studio_builder_invitation(uuid, text) from public;
grant execute on function public.respond_to_studio_builder_invitation(uuid, text) to authenticated;

-- Existing direct conversations must follow the same rule; otherwise a thread
-- created before studio membership could still be used to contact an employee.
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
    select 1 from public.conversations c
    where c.id = p_conversation
      and (
        (c.conversation_type = 'direct'
          and auth.uid() in (c.user_a, c.user_b)
          and public.can_direct_message(c.user_a, c.user_b))
        or
        (c.conversation_type = 'studio_client' and (
          c.client_id = auth.uid()
          or exists (select 1 from public.studios s where s.id = c.studio_id and s.moderator_id = auth.uid())
          or exists (
            select 1 from public.orders o
            join public.studio_order_assignments a on a.order_id = o.id
            where o.conversation_id = c.id and a.builder_id = auth.uid()
              and (a.released_at is null or p_message_created_at <= a.released_at)
          )
        ))
      )
  );
$$;

create or replace function public._can_write_conversation(p_conversation uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (
        (c.conversation_type = 'direct'
          and auth.uid() in (c.user_a, c.user_b)
          and public.can_direct_message(c.user_a, c.user_b))
        or
        (c.conversation_type = 'studio_client' and (
          c.client_id = auth.uid()
          or exists (select 1 from public.studios s where s.id = c.studio_id and s.moderator_id = auth.uid())
          or exists (
            select 1 from public.orders o
            join public.studio_order_assignments a on a.order_id = o.id
            where o.conversation_id = c.id and a.builder_id = auth.uid()
              and a.released_at is null
              and o.status in ('paid', 'in_progress', 'delivered', 'disputed')
          )
        ))
      )
  );
$$;

-- Joining a studio removes independent customer pricing. Removing an employee
-- deliberately clears it as well, forcing the normal independent pricing and
-- portfolio steps before the builder can become Available again.
create or replace function public.complete_pending_studio_employee_registration()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid(); v_code citext; v_studio uuid; v_membership uuid; v_status text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select pending_employee_code into v_code from public.builder_profiles where id = me;
  if v_code is null then raise exception 'No pending studio registration'; end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then raise exception 'This account already belongs to a studio'; end if;
  if not exists (select 1 from public.profiles where id = me and role in ('builder', 'both') and onboarding_completed_at is null and username is not null and length(trim(display_name)) >= 2) then raise exception 'Complete your builder identity first'; end if;
  if not exists (select 1 from public.builder_profiles where id = me and coalesce(array_length(tools, 1), 0) > 0 and coalesce(array_length(specialties, 1), 0) > 0 and coalesce(array_length(build_types, 1), 0) > 0 and coalesce(response_time_hours, 0) > 0) then raise exception 'Complete your builder details before joining the studio'; end if;
  select c.studio_id into v_studio from public.studio_employee_codes c join public.studios s on s.id = c.studio_id where c.code = v_code and c.status = 'active' and s.status in ('pending', 'active') and (c.expires_at is null or c.expires_at > now()) and c.redemptions_used < c.max_redemptions for update of c;
  if v_studio is null then raise exception 'That employee code is invalid, expired, or full'; end if;
  update public.studio_employee_codes set redemptions_used = redemptions_used + 1 where studio_id = v_studio and code = v_code and redemptions_used < max_redemptions;
  if not found then raise exception 'That employee code is full'; end if;
  select availability_status into v_status from public.builder_profiles where id = me;
  v_status := case when v_status = 'available' then 'available' else 'busy' end;
  update public.builder_profiles set profile_type = 'studio_employee', studio_id = v_studio, rates = '{}'::jsonb, availability_status = v_status, is_available = (v_status <> 'busy'), pending_employee_code = null where id = me;
  update public.profiles set onboarding_completed_at = now() where id = me;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source) values (v_studio, me, v_status, case when v_status = 'busy' then 'manual' else null end) returning id into v_membership;
  return v_membership;
end;
$$;

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
  if exists (select 1 from public.studio_order_assignments a where a.studio_id = v_studio and a.builder_id = p_builder and a.released_at is null) then raise exception 'Reassign or finish this employee''s active order first'; end if;
  update public.studio_memberships set status = 'removed', removed_at = now(), availability_status = 'busy', busy_source = null where studio_id = v_studio and builder_id = p_builder and status = 'active';
  if not found then raise exception 'Active employee not found'; end if;
  update public.builder_profiles set profile_type = 'independent', studio_id = null, studio_promo_bps = null, studio_promo_ends_at = null, rates = '{}'::jsonb, availability_status = 'busy', is_available = false where id = p_builder;
  update public.profiles set onboarding_completed_at = null where id = p_builder;
end;
$$;

notify pgrst, 'reload schema';
