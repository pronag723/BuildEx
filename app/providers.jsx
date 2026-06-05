"use client";

import { AuthProvider } from "../lib/auth/AuthContext";
import { UnreadProvider } from "../lib/chat/UnreadContext";
import { NotificationsProvider } from "../lib/notifications/NotificationsContext";
import { FavoritesProvider } from "../lib/favorites/FavoritesContext";

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <UnreadProvider>
        <NotificationsProvider>
          <FavoritesProvider>{children}</FavoritesProvider>
        </NotificationsProvider>
      </UnreadProvider>
    </AuthProvider>
  );
}
