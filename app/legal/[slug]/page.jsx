import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_EFFECTIVE, legalDocuments, legalSlugs } from "../documents";

export function generateStaticParams() { return legalSlugs.map((slug) => ({ slug })); }

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const doc = legalDocuments[slug];
  return doc ? { title: `${doc.title} | BuildEx`, description: doc.summary } : {};
}

export default async function LegalDocumentPage({ params }) {
  const { slug } = await params;
  const doc = legalDocuments[slug];
  if (!doc) notFound();
  return (
    <main className="min-h-screen bg-[#07070a] text-white px-6 py-16">
      <article className="mx-auto max-w-3xl">
        <Link href="/legal/" className="text-sm text-violet-300 hover:text-violet-200">← Legal Center</Link>
        <h1 className="mt-8 text-4xl font-black">{doc.title}</h1>
        <p className="mt-3 text-gray-400">{doc.summary}</p>
        <p className="mt-3 text-xs uppercase tracking-wider text-gray-500">Version {doc.version} · Effective {LEGAL_EFFECTIVE}</p>
        <div className="mt-10 space-y-10">
          {doc.sections.map(([heading, paragraphs]) => <section key={heading}><h2 className="text-xl font-bold">{heading}</h2><div className="mt-3 space-y-3 text-[15px] leading-7 text-gray-300">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}
        </div>
        <div className="mt-14 border-t border-white/10 pt-6 text-sm text-gray-500">Questions? Contact <a className="text-violet-300" href="mailto:legal@buildex.builders">legal@buildex.builders</a>.</div>
      </article>
    </main>
  );
}
