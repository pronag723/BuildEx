import { Suspense } from "react";
import ReadyBuildCheckoutPage from "./components/ReadyBuildCheckoutPage";

export const metadata = {
  title: "Buy a Ready-Made Build | BuildEx",
  description: "Review a ready-made Minecraft build and choose a payment method.",
};

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-2 border-[#4ade80] border-t-transparent" /></main>}>
      <ReadyBuildCheckoutPage />
    </Suspense>
  );
}
