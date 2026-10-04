import { notFound } from "next/navigation";
import { legalDocuments, legalSlugs } from "../documents";
import LegalDocumentView from "../LegalDocumentView";

export function generateStaticParams() {
  return legalSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const doc = legalDocuments[slug];
  return doc ? {
    title: `${doc.title} | BuildEx`,
    description: doc.summary,
    alternates: { canonical: `/legal/${slug}/` }
  } : {};
}

// The document body is a client component (LegalDocumentView) so it can follow
// the interface language; this file stays a server component for the static
// params and metadata.
export default async function LegalDocumentPage({ params }) {
  const { slug } = await params;
  if (!legalDocuments[slug]) notFound();

  return <LegalDocumentView slug={slug} />;
}
