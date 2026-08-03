"use client";

import { useEffect } from "react";
import { useAuth } from "../../lib/auth/AuthContext";
import { flushPendingAccountAcceptance } from "../../lib/legal/api";

export default function LegalAcceptanceRecorder() {
  const { status, profileLoaded } = useAuth();

  useEffect(() => {
    if (status === "authenticated" && profileLoaded) void flushPendingAccountAcceptance();
  }, [status, profileLoaded]);

  return null;
}
