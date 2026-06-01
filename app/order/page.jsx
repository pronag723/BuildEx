import { Suspense } from "react";
import OrderPlacementPage from "./components/OrderPlacementPage";

export const metadata = {
  title: "Place an Order | BuildEx",
  description: "Commission a Minecraft builder on BuildEx.",
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
        </main>
      }
    >
      <OrderPlacementPage />
    </Suspense>
  );
}
