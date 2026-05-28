"use client";

import AuthShell from "../auth/components/AuthShell";
import AuthCard from "../auth/components/AuthCard";

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthCard mode="signup" />
    </AuthShell>
  );
}
