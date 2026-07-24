-- Allow public storefront/feed consumers to read the About field added in
-- migration 0051. Migration 0044 intentionally uses column-level grants, so
-- new public columns must be granted explicitly.

grant select (about) on public.studios to anon, authenticated;

notify pgrst, 'reload schema';
