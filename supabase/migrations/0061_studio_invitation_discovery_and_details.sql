-- Studio invitation discovery, detail access, and re-invitation support.

drop function if exists public.search_independent_builders(text);

create or replace function public.search_independent_builders(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  builder_profile jsonb,
  pending_invitation_id uuid,
  pending_invitation_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_studio uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select s.id into v_studio from public.studios s where s.moderator_id = me;
  if v_studio is null then raise exception 'Studio not found'; end if;

  return query
  select p.id,
         p.username,
         p.display_name,
         p.avatar_url,
         p.bio,
         to_jsonb(bp) - 'pending_employee_code' - 'studio_id' - 'payout_details' as builder_profile,
         pending.id as pending_invitation_id,
         pending.status as pending_invitation_status
    from public.profiles p
    join public.builder_profiles bp on bp.id = p.id
    left join public.studio_builder_invitations pending
      on pending.studio_id = v_studio
     and pending.builder_id = p.id
     and pending.status = 'pending'
   where p.username is not null
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

-- Versioned entrypoint lets clients detect deployments that have not applied
-- this migration without silently using the old onboarding-gated function.
create or replace function public.search_independent_builders_v2(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  builder_profile jsonb,
  pending_invitation_id uuid,
  pending_invitation_status text
)
language sql
security definer
set search_path = public
as $$
  select * from public.search_independent_builders(p_query);
$$;

revoke all on function public.search_independent_builders_v2(text) from public;
grant execute on function public.search_independent_builders_v2(text) to authenticated;

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
    select 1
      from public.profiles p
      join public.builder_profiles bp on bp.id = p.id
     where p.id = p_builder
       and p.username is not null
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

create or replace function public.create_studio_builder_invitation_v2(p_builder uuid)
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
    where p.id = p_builder and p.username is not null
      and p.role in ('builder', 'both') and bp.profile_type = 'independent'
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

revoke all on function public.create_studio_builder_invitation_v2(uuid) from public;
grant execute on function public.create_studio_builder_invitation_v2(uuid) to authenticated;

create or replace function public.list_my_studio_builder_invitations()
returns table (
  id uuid,
  studio_id uuid,
  builder_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  studio jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select i.id,
         i.studio_id,
         i.builder_id,
         i.status,
         i.created_at,
         i.responded_at,
         jsonb_build_object(
           'id', s.id,
           'name', s.name,
           'slug', s.slug,
           'logo_url', s.logo_url,
           'about', s.about,
           'avg_rating', s.avg_rating,
           'reviews_count', s.reviews_count,
           'completed_orders', s.completed_orders,
           'employee_commission_bps', s.employee_commission_bps
         ) as studio
    from public.studio_builder_invitations i
    join public.studios s on s.id = i.studio_id
   where i.builder_id = auth.uid()
     and i.status = 'pending'
   order by i.created_at desc;
$$;

revoke all on function public.list_my_studio_builder_invitations() from public;
grant execute on function public.list_my_studio_builder_invitations() to authenticated;

notify pgrst, 'reload schema';
