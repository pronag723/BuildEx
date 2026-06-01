import { Suspense } from "react";
import OrdersPage from "./components/OrdersPage";

export const metadata = {
  title: "Orders | BuildEx",
  description: "Your orders on BuildEx.",
};

// One static route, two modes:
//   /orders            → role-aware dashboard (Incoming + My purchases)
//   /orders?id=<uuid>  → single-order detail + timeline + actions
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <OrdersPage />
    </Suspense>
  );
}
