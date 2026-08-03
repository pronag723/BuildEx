import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ChevronRight, Mail } from "lucide-react";
import { LEGAL_EFFECTIVE, legalDocuments, legalSlugs } from "../documents";

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

function sectionId(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default async function LegalDocumentPage({ params }) {
  const { slug } = await params;
  const doc = legalDocuments[slug];
  if (!doc) notFound();

  return (
    <main className="relative z-10 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <Link href="/legal/" className="inline-flex items-center gap-2 font-semibold text-gray-300 transition hover:text-white"><ArrowLeft size={15} aria-hidden="true" /> Legal Center</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="truncate">{doc.title}</span>
        </nav>

        <header className="mt-8 max-w-4xl border-b border-white/10 pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#86efac]"><BadgeCheck size={14} aria-hidden="true" /> Official BuildEx policy</div>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.035em] text-white sm:text-5xl">{doc.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-gray-400 sm:text-lg">{doc.summary}</p>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            <span>Version {doc.version}</span><span>Effective {LEGAL_EFFECTIVE}</span>
          </div>
        </header>

        <div className="mt-10 grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-10 border-l border-white/10 pl-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-gray-500">On this page</p>
              <ol className="space-y-3">
                {doc.sections.map(([heading], index) => (
                  <li key={heading}>
                    <a href={`#${sectionId(heading)}`} className="group flex gap-3 text-sm leading-5 text-gray-500 transition hover:text-white">
                      <span className="text-[11px] tabular-nums text-gray-600 group-hover:text-[#4ade80]">{String(index + 1).padStart(2, "0")}</span>{heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0">
            <div className="space-y-12">
              {doc.sections.map(([heading, paragraphs], index) => (
                <section key={heading} id={sectionId(heading)} className="scroll-mt-8">
                  <div className="mb-4 flex items-baseline gap-4">
                    <span className="text-xs font-bold tabular-nums text-[#4ade80]">{String(index + 1).padStart(2, "0")}</span>
                    <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{heading}</h2>
                  </div>
                  <div className="space-y-4 border-l border-white/[0.08] pl-8 text-[15px] leading-7 text-gray-300 sm:text-base sm:leading-8">
                    {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-16 flex flex-col gap-5 rounded-3xl border border-[#4ade80]/20 bg-[#4ade80]/[0.055] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div><h2 className="text-lg font-bold text-white">Questions about this document?</h2><p className="mt-2 text-sm leading-6 text-gray-400">Our legal team can help clarify how this policy applies to BuildEx.</p></div>
              <a href="mailto:legal@buildex.builders" className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#86efac] transition hover:text-[#4ade80]"><Mail size={17} aria-hidden="true" /> legal@buildex.builders</a>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
