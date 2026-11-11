"use client";

// /onboarding/builder/styles — retired step.
//
// Builder signup used to ask for styles here. Styles are gone (builders say
// what they build in their bio), so signup is identity → portfolio. The path
// stays as a client redirect so a half-finished signup or an old link does not
// 404: the identity step's OnboardingGate forwards to wherever the user
// actually is.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BUILDER_ONBOARDING_START } from "../../../../lib/onboarding/state";

export default function RetiredStylesStep() {
  const router = useRouter();

  useEffect(() => {
    router.replace(BUILDER_ONBOARDING_START);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" role="status" />
    </main>
  );
}
