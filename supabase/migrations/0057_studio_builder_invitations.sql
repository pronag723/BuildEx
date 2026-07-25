-- BuildEx — studio invitations and complete builder membership transitions
-- Depends on managed studios (0041–0044) and notifications (0016).

create table if not exists public.studio_builder_invitations (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  builder_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists studio_builder_invitations_pending_unique
  on public.studio_builder_invitations (studio_id, builder_id)
  where status = 'pending';
create index if not exists studio_builder_invitations_builder_idx
  on public.studio_builder_invitations (builder_id, status, created_at desc);
create index if not exists studio_builder_invitations_studio_idx
  on public.studio_builder_invitations (studio_id, status, created_at desc);

alter table public.studio_builder_invitations enable row level security;

drop policy if exists "invited builder reads own invitations" on public.studio_builder_invitations;
create policy "invited builder reads own invitations"
  on public.studio_builder_invitations for select
  using (builder_id = auth.uid());

drop policy if exists "studio moderator reads invitations" on public.studio_builder_invitations;
create policy "studio moderator reads invitations"
  on public.studio_builder_invitations for select
  using (exists (
    select 1 from public.studios s
    where s.id = studio_id and s.moderator_id = auth.uid()
  ));

create or replace function public.search_independent_builders(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  builder_profile jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return query
  select p.id, p.username, p.display_name, p.avatar_url, p.bio,
         to_jsonb(bp) - 'pending_employee_code' - 'studio_id' - 'payout_details' as builder_profile
    from public.profiles p
    join public.builder_profiles bp on bp.id = p.id
   where p.onboarding_completed_at is not null
     and p.role in ('builder', 'both')
     and bp.profile_type = 'independent'
     and not exists (
       select 1 from public.studio_memberships m
        where m.builder_id = p.id and m.status = 'active'
     )
     and (
       btrim(coalesce(p_query, '')) = ''
       or p.username ilike '%' || btrim(p_query) || '%'
       or p.display_name ilike '%' || btrim(p_query) || '%'
     )
   order by p.display_name nulls last, p.username
   limit 20;
end;
$$;
revoke all on function public.search_independent_builders(text) from public;
grant execute on function public.search_independent_builders(text) to authenticated;

create or replace function public.create_studio_builder_invitation(p_builder uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_studio uuid;
  v_invite uuid;
  v_name text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select id, name into v_studio, v_name from public.studios where moderator_id = me;
  if v_studio is null then raise exception 'Studio not found'; end if;
  if not exists (
    select 1 from public.profiles p
    join public.builder_profiles bp on bp.id = p.id
    where p.id = p_builder
      and p.onboarding_completed_at is not null
      and p.role in ('builder', 'both')
      and bp.profile_type = 'independent'
  ) then raise exception 'Only an independent completed builder can be invited'; end if;
  if exists (select 1 from public.studio_memberships m where m.builder_id = p_builder and m.status = 'active') then
    raise exception 'This builder already belongs to a studio';
  end if;
  insert into public.studio_builder_invitations (studio_id, builder_id)
  values (v_studio, p_builder)
  returning id into v_invite;
  perform public._notify(
    p_builder,
    'studio_invitation',
    'Studio invitation received',
    'You have been invited to join ' || v_name || '.',
    '/account?studio_invitation=' || v_invite::text
  );
  return v_invite;
exception when unique_violation then
  raise exception 'This builder already has a pending invitation';
end;
$$;
revoke all on function public.create_studio_builder_invitation(uuid) from public;
grant execute on function public.create_studio_builder_invitation(uuid) to authenticated;

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
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;
  select availability_status into v_status from public.builder_profiles where id = me;
  v_status := case when v_status = 'available' then 'available' else 'busy' end;
  update public.builder_profiles
     set profile_type = 'studio_employee',
         studio_id = v_inv.studio_id,
         availability_status = v_status,
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

create or replace function public.cancel_studio_builder_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.studio_builder_invitations i
     set status = 'cancelled', responded_at = now()
    from public.studios s
   where i.id = p_invitation and i.studio_id = s.id and s.moderator_id = auth.uid() and i.status = 'pending';
  if not found then raise exception 'Pending invitation not found'; end if;
end;
$$;
revoke all on function public.cancel_studio_builder_invitation(uuid) from public;
grant execute on function public.cancel_studio_builder_invitation(uuid) to authenticated;

create or replace function public.complete_pending_studio_employee_registration()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_code citext;
  v_studio uuid;
  v_membership uuid;
  v_status text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select pending_employee_code into v_code from public.builder_profiles where id = me;
  if v_code is null then raise exception 'No pending studio registration'; end if;
  if exists (select 1 from public.studio_memberships where builder_id = me and status = 'active') then
    raise exception 'This account already belongs to a studio';
  end if;
  if not exists (
    select 1 from public.profiles where id = me and role in ('builder', 'both')
      and onboarding_completed_at is null and username is not null and display_name is not null
  ) then raise exception 'Complete your builder identity first'; end if;
  if not exists (select 1 from public.builder_profiles where id = me
      and coalesce(array_length(tools, 1), 0) > 0
      and coalesce(array_length(specialties, 1), 0) > 0
      and coalesce(array_length(build_types, 1), 0) > 0
      and coalesce(response_time_hours, 0) > 0
      and jsonb_typeof(rates) = 'object' and rates <> '{}'::jsonb) then
    raise exception 'Complete your builder details before joining the studio';
  end if;
  select c.studio_id into v_studio
    from public.studio_employee_codes c join public.studios s on s.id = c.studio_id
   where c.code = v_code and c.status = 'active' and s.status in ('pending', 'active')
     and (c.expires_at is null or c.expires_at > now()) and c.redemptions_used < c.max_redemptions
   for update of c;
  if v_studio is null then raise exception 'That employee code is invalid, expired, or full'; end if;
  update public.studio_employee_codes set redemptions_used = redemptions_used + 1
   where studio_id = v_studio and code = v_code and redemptions_used < max_redemptions;
  if not found then raise exception 'That employee code is full'; end if;
  select availability_status into v_status from public.builder_profiles where id = me;
  v_status := case when v_status = 'available' then 'available' else 'busy' end;
  update public.builder_profiles set profile_type = 'studio_employee', studio_id = v_studio,
    availability_status = v_status, is_available = (v_status = 'available'), pending_employee_code = null where id = me;
  update public.profiles set onboarding_completed_at = now() where id = me;
  insert into public.studio_memberships (studio_id, builder_id, availability_status, busy_source)
  values (v_studio, me, v_status, case when v_status = 'busy' then 'manual' else null end)
  returning id into v_membership;
  return v_membership;
end;
$$;
revoke all on function public.complete_pending_studio_employee_registration() from public;
grant execute on function public.complete_pending_studio_employee_registration() to authenticated;

-- Removal must restore an independent builder, not leave a hidden employee record.
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
  if exists (select 1 from public.studio_order_assignments a where a.studio_id = v_studio and a.builder_id = p_builder and a.released_at is null) then
    raise exception 'Reassign or finish this employee''s active order first';
  end if;
  update public.studio_memberships set status = 'removed', removed_at = now(), availability_status = 'busy', busy_source = null
   where studio_id = v_studio and builder_id = p_builder and status = 'active';
  if not found then raise exception 'Active employee not found'; end if;
  update public.builder_profiles set profile_type = 'independent', studio_id = null, studio_promo_bps = null,
    studio_promo_ends_at = null, availability_status = 'busy', is_available = false where id = p_builder;
  update public.profiles set onboarding_completed_at = null where id = p_builder;
end;
$$;
revoke all on function public.remove_studio_employee(uuid) from public;
grant execute on function public.remove_studio_employee(uuid) to authenticated;

notify pgrst, 'reload schema';
