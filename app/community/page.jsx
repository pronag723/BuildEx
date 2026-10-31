import { Suspense } from "react";
import CommunityPage from "./components/CommunityPage";

export const metadata = {
  title: "Community | BuildEx",
  description: "Minecraft builds from BuildEx builders, and requests from people looking for a builder.",
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line/20 border-t-accent" />
        </main>
      }
    >
      <CommunityPage />
    </Suspense>
  );
}
