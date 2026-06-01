import { Suspense } from "react";
import OrdersStubPage from "./components/OrdersStubPage";

export const metadata = {
  title: "Orders | BuildEx",
  description: "Your orders on BuildEx.",
};

// Stage 3 ships a stub destination for the post-payment redirect. Stage 4
// replaces this with role-aware dashboards + an /orders?id=... detail view.
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <OrdersStubPage />
    </Suspense>
  );
}
