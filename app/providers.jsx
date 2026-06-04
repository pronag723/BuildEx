"use client";

import { AuthProvider } from "../lib/auth/AuthContext";
import { UnreadProvider } from "../lib/chat/UnreadContext";
import { NotificationsProvider } from "../lib/notifications/NotificationsContext";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <UnreadProvider>
        <NotificationsProvider>{children}</NotificationsProvider>
      </UnreadProvider>
    </AuthProvider>
  );
}
