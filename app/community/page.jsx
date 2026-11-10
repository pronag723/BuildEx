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
        <main aria-busy="true" className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-20">
          <div className="skeleton h-5 w-40 rounded" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </main>
      }
    >
      <CommunityPage />
    </Suspense>
  );
}
