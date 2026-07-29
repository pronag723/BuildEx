import { withBase } from "../../app/home/utils";
import { STEPS } from "./state";

export {
  COMPLETION_RECOVERY_MS,
  runOnboardingCompletion,
} from "./completion-watchdog.mjs";

/**
 * Leave the onboarding React tree after the server has committed completion.
 *
 * A client-side router transition can leave the final step suspended with its
 * saving state still painted, even though Supabase has already completed the
 * profile. A full replace also reloads the authoritative profile/session state,
 * which is exactly what previously made a manual refresh recover the flow.
 */
export function navigateAfterOnboarding({ router, updateProfile } = {}) {
  // Keep AuthContext/localStorage from briefly treating the completed account
  // as abandoned while the new document loads.
  updateProfile?.({ onboarding_completed_at: new Date().toISOString() });

  if (typeof window !== "undefined") {
    window.location.replace(withBase(STEPS.complete));
    return;
  }

  // Defensive fallback for non-browser rendering and lightweight test doubles.
  router?.replace(STEPS.complete);
}
