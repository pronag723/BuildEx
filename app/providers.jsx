"use client";

import { AuthProvider } from "../lib/auth/AuthContext";
import { UnreadProvider } from "../lib/chat/UnreadContext";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <UnreadProvider>{children}</UnreadProvider>
    </AuthProvider>
  );
}
