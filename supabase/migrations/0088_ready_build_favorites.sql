-- Let signed-in users save individual ready-made builds through the existing
-- owner-scoped favorites table.

alter table public.favorites
  add column if not exists ready_build_id uuid
  references public.ready_builds(id) on delete cascade;

alter table public.favorites
  drop constraint if exists favorites_target_exactly_one;

alter table public.favorites
  add constraint favorites_target_exactly_one check (
    (builder_id is not null)::int
    + (studio_id is not null)::int
    + (ready_build_id is not null)::int = 1
  );

create unique index if not exists favorites_user_ready_build_unique
  on public.favorites (user_id, ready_build_id)
  where ready_build_id is not null;

notify pgrst, 'reload schema';
