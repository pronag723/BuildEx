-- =============================================================================
-- BuildEx — Builder toolset
-- Adds builder_profiles.tools, the list of tools/software a builder works with.
-- This replaces the "years of experience" question in onboarding; the legacy
-- years_experience column is left in place so existing rows keep their data,
-- but it is no longer collected or required.
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.builder_profiles
  add column if not exists tools text[] default '{}';
