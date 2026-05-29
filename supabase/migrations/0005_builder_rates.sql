-- =============================================================================
-- BuildEx — Builder self-set rates
-- Adds builder_profiles.rates, a JSON object holding the builder's own pricing
-- tiers. Each tier maps a build scale (small / medium / large) to a block area
-- and a price range the builder is willing to take that scale on for.
--
-- Shape:
--   {
--     "small":  { "blocks": 100, "from": 200,  "to": 500 },
--     "medium": { "blocks": 200, "from": 500,  "to": 900 },
--     "large":  { "blocks": 350, "from": 900,  "to": 1800 }
--   }
-- `blocks` is the build's side length in blocks (area = blocks × blocks);
-- `from` / `to` are USD. Mirrors the RateCard UI shown on public builder pages.
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.builder_profiles
  add column if not exists rates jsonb default '{}'::jsonb;
