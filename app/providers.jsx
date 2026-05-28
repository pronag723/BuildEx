"use client";

import { AuthProvider } from "../lib/auth/AuthContext";

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
