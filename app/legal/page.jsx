import LegalIndexView from "./LegalIndexView";

export const metadata = {
  title: "Legal Center | BuildEx",
  description: "The BuildEx terms of use, privacy policy, community and copyright policy, and legal notice.",
  alternates: { canonical: "/legal/" }
};

// The page body is a client component (LegalIndexView) so it can follow the
// interface language; this file stays a server component for its metadata.
export default function LegalIndexPage() {
  return <LegalIndexView />;
}
