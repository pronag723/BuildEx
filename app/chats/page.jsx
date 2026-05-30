import { Suspense } from "react";
import ChatsPage from "./components/ChatsPage";

export const metadata = {
  title: "Messages | BuildEx",
  description: "Your conversations with Minecraft builders and clients on BuildEx.",
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
      <ChatsPage />
    </Suspense>
  );
}
