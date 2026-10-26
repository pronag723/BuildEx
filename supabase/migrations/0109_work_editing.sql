-- =============================================================================
-- BuildEx — Work editor RPCs (profile redesign, stage 6)
--
-- Why this exists
-- ---------------
-- The work editor in onboarding and /account changes several rows at once:
-- the order of a builder's works, the order of one work's photos, which work
-- is pinned, a work's whole co-author list, the order of price tiers. Done as
-- one PATCH per row from the browser, a dropped connection leaves half an
-- order, and the one-pinned-work unique index (0106) makes "move the pin" two
-- writes that must happen together. Each of these is one SECURITY DEFINER
-- function instead, scoped to the caller's own rows.
--
-- Also retires one transitional trigger from 0106: portfolio_images_sync_
-- shell_position kept an untitled one-photo work's position in step with its
-- image while the old uploader could only reorder images. The editor orders
-- works itself, and the trigger would now fight it (reordering a legacy
-- work's photos would move the work). The other two transitional triggers
-- stay until no browser can still be running the old uploader:
-- portfolio_images_autowork (an image inserted without a work still gets
-- one) and portfolio_images_drop_empty_shell (only ever deletes an untitled,
-- undescribed work with no photos left).
--
-- Every function revokes EXECUTE from anon by name (Supabase grants new
-- functions to anon and authenticated directly — see 0107).
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. Order of the caller's works ─────────────────────────────────────────
-- p_ids in display order; works not listed keep their position.
create or replace function public.reorder_my_works(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.works w
     set position = array_position(p_ids, w.id) - 1
   where w.builder_id = auth.uid()
     and w.id = any(p_ids);
end;
$$;

revoke all on function public.reorder_my_works(uuid[]) from public, anon;
grant execute on function public.reorder_my_works(uuid[]) to authenticated;


-- ─── 2. Order of one work's photos ──────────────────────────────────────────
create or replace function public.reorder_work_photos(p_work uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.works where id = p_work and builder_id = auth.uid()) then
    raise exception 'That work does not exist';
  end if;
  update public.portfolio_images p
     set position = array_position(p_ids, p.id) - 1
   where p.work_id = p_work
     and p.builder_id = auth.uid()
     and p.id = any(p_ids);
end;
$$;

revoke all on function public.reorder_work_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_work_photos(uuid, uuid[]) to authenticated;


-- ─── 3. Pin a work as "Best work" (or unpin with null) ──────────────────────
create or replace function public.set_pinned_work(p_work uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_work is not null
     and not exists (select 1 from public.works where id = p_work and builder_id = auth.uid()) then
    raise exception 'That work does not exist';
  end if;
  update public.works set is_pinned = false
   where builder_id = auth.uid() and is_pinned and id is distinct from p_work;
  if p_work is not null then
    update public.works set is_pinned = true where id = p_work;
  end if;
end;
$$;

revoke all on function public.set_pinned_work(uuid) from public, anon;
grant execute on function public.set_pinned_work(uuid) to authenticated;


-- ─── 4. Replace a work's co-author list ─────────────────────────────────────
-- p_items: [{ "coauthor_id": uuid | null, "name": text | null, "role": text | null }]
-- in display order. The 0106 trigger still checks each row (not yourself, a
-- visible builder, at most work_coauthors_max()), so a bad item aborts the
-- whole save and the old list stays.
create or replace function public.save_work_coauthors(p_work uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.works where id = p_work and builder_id = auth.uid()) then
    raise exception 'That work does not exist';
  end if;

  delete from public.work_coauthors where work_id = p_work;

  insert into public.work_coauthors (work_id, coauthor_id, name, role, position)
  select p_work,
         nullif(item ->> 'coauthor_id', '')::uuid,
         case when nullif(item ->> 'coauthor_id', '') is null
              then nullif(btrim(item ->> 'name'), '') end,
         nullif(btrim(item ->> 'role'), ''),
         (ord - 1)::smallint
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(item, ord);
end;
$$;

revoke all on function public.save_work_coauthors(uuid, jsonb) from public, anon;
grant execute on function public.save_work_coauthors(uuid, jsonb) to authenticated;


-- ─── 5. Order of the caller's price tiers ───────────────────────────────────
create or replace function public.reorder_my_price_tiers(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.builder_price_tiers t
     set position = array_position(p_ids, t.id) - 1
   where t.builder_id = auth.uid()
     and t.id = any(p_ids);
end;
$$;

revoke all on function public.reorder_my_price_tiers(uuid[]) from public, anon;
grant execute on function public.reorder_my_price_tiers(uuid[]) to authenticated;


-- ─── 6. Retire the shell-position sync from 0106 ────────────────────────────
drop trigger if exists portfolio_images_sync_shell_position on public.portfolio_images;


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
--   select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon
--     from pg_proc where proname in ('reorder_my_works', 'reorder_work_photos',
--     'set_pinned_work', 'save_work_coauthors', 'reorder_my_price_tiers');  -- anon = false
--   select tgname from pg_trigger
--    where tgrelid = 'public.portfolio_images'::regclass and not tgisinternal;
--   -- autowork, drop_empty_shell, work_rules — no sync_shell_position
