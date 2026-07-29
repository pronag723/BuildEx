export const COMPLETION_RECOVERY_MS = 15000;

/**
 * Run the final database operation with a last-resort recovery for a response
 * that never settles. In the reported failure, Postgres commits the profile
 * completion but the browser's Supabase promise remains pending indefinitely.
 * Reloading lets OnboardingGate read the committed row and route the user out.
 */
export async function runOnboardingCompletion(operation) {
  let recoveryTimer = null;

  if (typeof window !== "undefined") {
    recoveryTimer = window.setTimeout(() => {
      // The current step is intentionally reloaded instead of assuming the
      // write succeeded. If it committed, OnboardingGate routes to /account;
      // if it did not, the user safely returns to the final step to retry.
      window.location.reload();
    }, COMPLETION_RECOVERY_MS);
  }

  try {
    return await operation();
  } finally {
    if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
  }
}
