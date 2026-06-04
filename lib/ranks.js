// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Rank system (Stage 9)
// Single JS source of truth for the rank → commission mapping and the
// promotion criteria. This MIRRORS the SQL in
// supabase/migrations/0014_ranks.sql (commission_bps_for_rank / rank_for_metrics);
// if you change a number here, change it there too. The server is authoritative
// — the DB recomputes rank and snapshots commission at place_order — these
// helpers exist so the UI can show the same numbers without a round-trip.
//
// Ranks are earned from REAL metrics maintained by the reviews/orders RPCs
// (builder_profiles.completed_orders + avg_rating, see migration 0013):
//
//   rookie    →  the starting rank
//   advanced  →  ≥ 5  completed orders AND avg rating > 4.0★
//   expert    →  ≥ 12 completed orders AND avg rating > 4.5★
//   master    →  ≥ 22 completed orders AND avg rating > 4.8★
//
// Commission is what the platform keeps; a higher rank pays a lower rate, so
// climbing the ranks directly rewards the builder.
// ─────────────────────────────────────────────────────────────────────────────

// Low → high. Index doubles as the rank's numeric tier for comparisons.
export const RANK_ORDER = ["rookie", "advanced", "expert", "master"];

// Each rank's commission rate (basis points so the SQL math stays integer) and
// the metrics needed to REACH it. `minCompleted` / `minRating` are 0 for rookie
// because it's the floor everyone starts at.
//   1 bp = 0.01% → 1500 bps = 15%.
export const RANK_RULES = {
  rookie:   { key: "rookie",   commissionBps: 1500, minCompleted: 0,  minRating: 0 },
  advanced: { key: "advanced", commissionBps: 1200, minCompleted: 5,  minRating: 4.0 },
  expert:   { key: "expert",   commissionBps: 800,  minCompleted: 12, minRating: 4.5 },
  master:   { key: "master",   commissionBps: 500,  minCompleted: 22, minRating: 4.8 },
};

/** Numeric tier of a rank (0 = rookie … 3 = master); -1 for an unknown key. */
export function rankTier(rank) {
  return RANK_ORDER.indexOf(rank);
}

/** Commission rate (basis points) the platform keeps for a given rank. */
export function commissionBpsForRank(rank) {
  return (RANK_RULES[rank] || RANK_RULES.rookie).commissionBps;
}

/** Format a basis-points rate as a percentage string: 1200 → "12%". */
export function formatCommissionRate(bps) {
  const pct = (Number(bps) || 0) / 100;
  // Whole numbers render cleanly ("12%"); a fractional rate keeps one decimal.
  return (Number.isInteger(pct) ? pct : pct.toFixed(1)) + "%";
}

/**
 * The rank a builder qualifies for from real metrics. Returns the HIGHEST rank
 * whose thresholds are all met (mirror of SQL rank_for_metrics). Rating uses a
 * strict greater-than, matching the "above 4.0★" product spec; a builder with
 * no reviews has avg_rating 0 and so stays rookie.
 */
export function computeRankFromMetrics({ completedOrders = 0, avgRating = 0 } = {}) {
  const completed = Number(completedOrders) || 0;
  const rating = Number(avgRating) || 0;
  // Walk high → low and return the first rank the builder satisfies.
  for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
    const rule = RANK_RULES[RANK_ORDER[i]];
    if (completed >= rule.minCompleted && rating > rule.minRating) {
      return rule.key;
    }
    // rookie has minRating 0; `rating > 0` would wrongly fail an unrated
    // builder, so the loop's base case below handles the floor explicitly.
  }
  return "rookie";
}

/** The next rank up, or null if already master. */
export function nextRank(rank) {
  const tier = rankTier(rank);
  if (tier < 0 || tier >= RANK_ORDER.length - 1) return null;
  return RANK_ORDER[tier + 1];
}

/**
 * Progress toward the next rank for the /account dashboard. Returns null when
 * the builder is already master (nothing left to earn). Otherwise:
 *   { next, rule, ordersHave, ordersNeed, ordersMet,
 *     ratingHave, ratingNeed, ratingMet, ordersPct }
 * ordersPct is a 0–1 fraction for a progress bar.
 */
export function rankProgress({ rank, completedOrders = 0, avgRating = 0 } = {}) {
  const next = nextRank(rank);
  if (!next) return null;

  const rule = RANK_RULES[next];
  const ordersHave = Number(completedOrders) || 0;
  const ratingHave = Number(avgRating) || 0;

  return {
    next,
    rule,
    ordersHave,
    ordersNeed: rule.minCompleted,
    ordersMet: ordersHave >= rule.minCompleted,
    ratingHave,
    ratingNeed: rule.minRating,
    ratingMet: ratingHave > rule.minRating,
    ordersPct: rule.minCompleted > 0
      ? Math.min(1, ordersHave / rule.minCompleted)
      : 1,
  };
}
