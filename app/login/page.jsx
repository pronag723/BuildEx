"use client";

import AuthShell from "../auth/components/AuthShell";
import AuthCard from "../auth/components/AuthCard";

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthCard mode="login" />
    </AuthShell>
  );
}
