-- =============================================================================
-- BuildEx — Exact per-size pricing (rates schema migration)
-- Backfills builder_profiles.rates from the old price-range shape
--   { small:{blocks,from,to}, medium:{…}, large:{…} }
-- to the new exact-price shape
--   { small:{enabled:bool, blocks:int, price:int_kopecks}, … }
--
-- price is copied directly from the old `from` value (treated as kopecks).
-- enabled is set to true for every tier that existed in the old data.
-- Tiers that were absent in the old object are omitted from the new one.
-- Idempotent: only touches rows that still carry the old `from` key.
-- =============================================================================

DO $$
DECLARE
  r       RECORD;
  new_rates JSONB;
  tier    TEXT;
  tv      JSONB;
BEGIN
  FOR r IN
    SELECT id, rates
    FROM public.builder_profiles
    WHERE rates IS NOT NULL
      AND rates != '{}'::JSONB
      AND (
           (rates->'small'  ? 'from') OR
           (rates->'medium' ? 'from') OR
           (rates->'large'  ? 'from')
      )
  LOOP
    new_rates := '{}'::JSONB;

    FOREACH tier IN ARRAY ARRAY['small', 'medium', 'large']
    LOOP
      tv := r.rates->tier;
      IF tv IS NOT NULL THEN
        IF tv ? 'from' THEN
          -- Old shape → migrate
          new_rates := new_rates || jsonb_build_object(
            tier,
            jsonb_build_object(
              'enabled', TRUE,
              'blocks',  COALESCE((tv->>'blocks')::INT, 0),
              'price',   COALESCE((tv->>'from')::INT,   0)
            )
          );
        ELSE
          -- Already new shape or unknown — keep as-is
          new_rates := new_rates || jsonb_build_object(tier, tv);
        END IF;
      END IF;
    END LOOP;

    UPDATE public.builder_profiles
    SET rates = new_rates
    WHERE id = r.id;
  END LOOP;
END;
$$;
