import { Suspense } from "react";
import AdminPage from "./components/AdminPage";

export const metadata = {
  title: "Admin · Disputes | BuildEx",
  description: "Resolve open disputes on BuildEx.",
};

// Admin-only dispute queue. Gating is enforced server-side: the
// list_open_disputes / resolve_dispute RPCs both re-check profiles.is_admin,
// so a non-admin who reaches this route simply sees an empty, inert page.
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
