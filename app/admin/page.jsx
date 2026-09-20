import { Suspense } from "react";
import AdminPage from "./components/AdminPage";

export const metadata = {
  title: "Admin · Moderation | BuildEx",
  description: "Moderate builder profiles, portfolio images and chat reports.",
};

// Admin-only moderation console. Gating is enforced server-side: every
// admin_* RPC it calls re-checks profiles.is_admin through _require_admin(),
// so a non-admin who reaches this route sees an inert page and gets nothing
// back from the database either way.
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <AdminPage />
    </Suspense>
  );
}
