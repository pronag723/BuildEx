-- =============================================================================
-- BuildEx — Profile editor: works mosaic + header background
--
-- Why this exists
-- ---------------
-- The builder now edits their profile in place, on the same layout visitors
-- see. Two things on that page need storage:
--
--   1. Works are a mosaic the builder arranges like phone widgets: each work
--      has a size (s = 1×1, w = 2×1, t = 1×2, l = 2×2) next to its position.
--      Order and sizes are saved together by save_my_works_layout(), one call
--      per "Done", so a dropped connection never leaves half an arrangement.
--      "Best work" (is_pinned, set_pinned_work) goes out of use: the builder
--      shows what matters by putting it first and making it big. The column,
--      its index and the RPC stay (decommission, never delete). The backfill
--      turns today's pinned work into a large tile and moves it to the front,
--      so no public profile changes order the moment clients stop sorting by
--      the pin.
--   2. A header background: none, a colour, or an image from the builder's own
--      portfolios folder, with a dim level. Visitors see it too, so the image
--      URL is pinned to <bucket>/portfolios/<builder id>/ — a profile can't
--      embed somebody else's file or a third-party tracking pixel.
--
-- Column privileges stay explicit (0028): each new column a builder writes is
-- granted by name. Public SELECT on builder_profiles is already table-wide.
-- The function revokes EXECUTE from anon by name (see 0107).
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. works.layout_size (+ one-time backfill) ─────────────────────────────
-- The backfill runs only in the same transaction that adds the column, so a
-- re-run can never undo an arrangement a builder has saved since.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'works' and column_name = 'layout_size'
  ) then
    alter table public.works
      add column layout_size text not null default 's';

    update public.works set layout_size = 'l' where is_pinned;

    -- Positions as the profile showed them: the pinned work first, then the
    -- builder's order. 0-based, like reorder_my_works (0109).
    update public.works w
       set position = r.rn - 1
      from (
        select id,
               row_number() over (partition by builder_id
                                  order by is_pinned desc, position, created_at) as rn
          from public.works
      ) r
     where w.id = r.id
       and w.position is distinct from r.rn - 1;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'works_layout_size_valid') then
    alter table public.works
      add constraint works_layout_size_valid check (layout_size in ('s', 'w', 't', 'l'));
  end if;
end;
$$;

grant update (layout_size) on public.works to authenticated;


-- ─── 2. Save order + sizes in one call ──────────────────────────────────────
-- p_ids in display order, p_sizes the size of each. Works not listed keep
-- their position and size; works that aren't the caller's are untouched.
create or replace function public.save_my_works_layout(p_ids uuid[], p_sizes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_ids is null or p_sizes is null
     or coalesce(cardinality(p_ids), 0) <> coalesce(cardinality(p_sizes), 0) then
    raise exception 'Every work needs a size';
  end if;
  if cardinality(p_ids) > public.works_per_builder_max() then
    raise exception 'You can have up to % works.', public.works_per_builder_max();
  end if;
  if exists (select 1 from unnest(p_sizes) s where s is null or s not in ('s', 'w', 't', 'l')) then
    raise exception 'Unknown work size';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'A work is listed twice';
  end if;

  update public.works w
     set position = (l.ord - 1)::int,
         layout_size = l.size
    from unnest(p_ids, p_sizes) with ordinality as l(id, size, ord)
   where w.id = l.id
     and w.builder_id = auth.uid();
end;
$$;

revoke all on function public.save_my_works_layout(uuid[], text[]) from public, anon;
grant execute on function public.save_my_works_layout(uuid[], text[]) to authenticated;


-- ─── 3. builder_profiles header background ─────────────────────────────────
alter table public.builder_profiles
  add column if not exists header_bg_kind text not null default 'none',
  add column if not exists header_bg_color text,
  add column if not exists header_bg_image_url text,
  add column if not exists header_bg_dim smallint not null default 45;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'builder_profiles_header_bg_kind_valid') then
    alter table public.builder_profiles
      add constraint builder_profiles_header_bg_kind_valid
      check (header_bg_kind in ('none', 'color', 'image'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'builder_profiles_header_bg_color_valid') then
    alter table public.builder_profiles
      add constraint builder_profiles_header_bg_color_valid
      check (header_bg_color is null or header_bg_color ~ '^#[0-9a-fA-F]{6}$');
  end if;

  -- https only, no quote/space/angle characters, and inside the builder's own
  -- folder of the portfolios bucket.
  if not exists (select 1 from pg_constraint where conname = 'builder_profiles_header_bg_image_valid') then
    alter table public.builder_profiles
      add constraint builder_profiles_header_bg_image_valid
      check (
        header_bg_image_url is null
        or (
          char_length(header_bg_image_url) <= 500
          and header_bg_image_url ~ '^https://[^\s"''<>\\`]+$'
          and position(('/portfolios/' || id::text || '/') in header_bg_image_url) > 0
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'builder_profiles_header_bg_dim_range') then
    alter table public.builder_profiles
      add constraint builder_profiles_header_bg_dim_range
      check (header_bg_dim between 0 and 90);
  end if;

  -- The chosen kind must have its value; the other value may stay, so
  -- switching back to it doesn't lose what was picked.
  if not exists (select 1 from pg_constraint where conname = 'builder_profiles_header_bg_complete') then
    alter table public.builder_profiles
      add constraint builder_profiles_header_bg_complete
      check (
        (header_bg_kind <> 'color' or header_bg_color is not null)
        and (header_bg_kind <> 'image' or header_bg_image_url is not null)
      );
  end if;
end;
$$;

-- Upsert (INSERT … ON CONFLICT DO UPDATE) needs both.
grant insert (header_bg_kind, header_bg_color, header_bg_image_url, header_bg_dim)
  on public.builder_profiles to authenticated;
grant update (header_bg_kind, header_bg_color, header_bg_image_url, header_bg_dim)
  on public.builder_profiles to authenticated;


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
--   select layout_size, count(*) from public.works group by 1;      -- l = pinned count
--   select builder_id, array_agg(is_pinned order by position) from public.works
--    group by 1 having bool_or(is_pinned) limit 5;                  -- pinned first
--   select has_function_privilege('anon', 'public.save_my_works_layout(uuid[], text[])', 'EXECUTE');  -- false
--   select has_column_privilege('authenticated', 'public.works', 'layout_size', 'UPDATE');            -- true
--   select has_column_privilege('authenticated', 'public.builder_profiles', 'header_bg_image_url', 'UPDATE');  -- true
--   select header_bg_kind, count(*) from public.builder_profiles group by 1;                        -- all none
