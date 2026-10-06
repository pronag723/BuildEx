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
          <div className="h-6 w-6 rounded-full border-2 border-line/20 border-t-accent animate-spin" />
        </main>
      }
    >
      <ChatsPage />
    </Suspense>
  );
}
