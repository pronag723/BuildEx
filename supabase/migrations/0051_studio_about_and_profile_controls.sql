-- Align managed-studio profile controls with the builder profile workflow.
-- Adds a public About field, an atomic registration wrapper that stores it,
-- and narrow moderator RPCs for About and instant availability updates.

alter table public.studios
  add column if not exists about text;

alter table public.studios
  drop constraint if exists studios_about_length_check;
alter table public.studios
  add constraint studios_about_length_check
  check (about is null or char_length(about) <= 320);

create or replace function public.complete_studio_registration_with_about(
  p_code text,
  p_name text,
  p_username text,
  p_avatar_url text,
  p_about text,
  p_rates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid;
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
begin
  if v_about is not null and char_length(v_about) > 320 then
    raise exception 'Studio About must be 320 characters or fewer';
  end if;

  v_studio := public.complete_studio_registration(
    p_code,
    p_name,
    p_username,
    p_avatar_url,
    p_rates
  );

  update public.studios
     set about = v_about
   where id = v_studio
     and moderator_id = auth.uid();

  return v_studio;
end;
$$;

alter function public.complete_studio_registration_with_about(
  text, text, text, text, text, jsonb
) owner to postgres;
alter function public.complete_studio_registration_with_about(
  text, text, text, text, text, jsonb
) set row_security = off;
revoke all on function public.complete_studio_registration_with_about(
  text, text, text, text, text, jsonb
) from public;
grant execute on function public.complete_studio_registration_with_about(
  text, text, text, text, text, jsonb
) to authenticated;

create or replace function public.update_my_studio_about(p_about text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_about is not null and char_length(v_about) > 320 then
    raise exception 'Studio About must be 320 characters or fewer';
  end if;

  update public.studios
     set about = v_about
   where moderator_id = auth.uid();

  if not found then raise exception 'Studio not found'; end if;
end;
$$;

alter function public.update_my_studio_about(text) owner to postgres;
alter function public.update_my_studio_about(text) set row_security = off;
revoke all on function public.update_my_studio_about(text) from public;
grant execute on function public.update_my_studio_about(text) to authenticated;

create or replace function public.set_my_studio_accepting_orders(
  p_accepting_orders boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select id
    into v_studio
    from public.studios
   where moderator_id = auth.uid();

  if v_studio is null then raise exception 'Studio not found'; end if;

  if coalesce(p_accepting_orders, false) and not exists (
    select 1
      from public.studios s
     where s.id = v_studio
       and s.status = 'active'
       and s.platform_commission_bps is not null
  ) then
    raise exception 'BuildEx must activate the studio and configure its commission first';
  end if;

  if coalesce(p_accepting_orders, false) and not exists (
    select 1
      from public.studio_memberships m
     where m.studio_id = v_studio
       and m.status = 'active'
  ) then
    raise exception 'Invite at least one employee before accepting orders';
  end if;

  update public.studios
     set accepting_orders = coalesce(p_accepting_orders, false)
   where id = v_studio;
end;
$$;

alter function public.set_my_studio_accepting_orders(boolean) owner to postgres;
alter function public.set_my_studio_accepting_orders(boolean) set row_security = off;
revoke all on function public.set_my_studio_accepting_orders(boolean) from public;
grant execute on function public.set_my_studio_accepting_orders(boolean) to authenticated;

notify pgrst, 'reload schema';
