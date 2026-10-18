import UnsubscribeView from "./UnsubscribeView";

export const metadata = {
  title: "Email preferences | BuildEx",
  description: "Turn BuildEx message emails off or back on.",
  // Every visit carries a personal token; nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export default function Page() {
  return <UnsubscribeView />;
}
