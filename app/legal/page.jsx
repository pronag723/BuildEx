import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  Copyright,
  FileText,
  Landmark,
  LockKeyhole,
  Scale,
  UsersRound,
  WalletCards
} from "lucide-react";
import LegalReturnLink from "./LegalReturnLink";
import { LEGAL_EFFECTIVE, legalDocuments, legalSlugs } from "./documents";

export const metadata = {
  title: "Legal Center | BuildEx",
  description: "Official BuildEx terms, marketplace policies, licenses, privacy information, and legal notices.",
  alternates: { canonical: "/legal/" }
};

const documentIcons = {
  terms: Scale,
  payments: WalletCards,
  sellers: UsersRound,
  "ready-build-license": Blocks,
  privacy: LockKeyhole,
  community: Copyright,
  "legal-notice": Landmark
};

export default function LegalIndexPage() {
  return (
    <main className="relative z-10 px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<span className="text-sm font-semibold text-gray-400">Back to BuildEx</span>}>
          <LegalReturnLink />
        </Suspense>

        <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#111512]/90 px-6 py-10 shadow-2xl shadow-black/30 sm:px-10 sm:py-14 lg:px-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4ade80]/10 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#86efac]">
              <BadgeCheck size={14} aria-hidden="true" />
              Official policies
            </div>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">BuildEx Legal Center</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
              The terms and policies that govern BuildEx accounts, marketplace transactions, builders, digital content, and privacy.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-gray-400">
              <span className="inline-flex items-center gap-2 text-gray-200"><FileText size={16} className="text-[#4ade80]" aria-hidden="true" />{legalSlugs.length} documents</span>
              <span>Effective {LEGAL_EFFECTIVE}</span>
              <span>English (US)</span>
            </div>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="legal-documents-heading">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#4ade80]">Policies &amp; notices</p>
              <h2 id="legal-documents-heading" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Find the document you need</h2>
            </div>
            <p className="hidden text-sm text-gray-500 sm:block">Current as of {LEGAL_EFFECTIVE}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {legalSlugs.map((slug, index) => {
              const doc = legalDocuments[slug];
              const DocumentIcon = documentIcons[slug] || FileText;
              return (
                <Link key={slug} href={`/legal/${slug}/`} className="group flex min-h-64 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#4ade80]/40 hover:bg-[#4ade80]/[0.055] hover:shadow-xl hover:shadow-[#4ade80]/[0.04]">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]"><DocumentIcon size={21} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="text-xs font-medium tabular-nums text-gray-600">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-bold leading-snug text-white transition-colors group-hover:text-[#86efac]">{doc.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-gray-400">{doc.summary}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs text-gray-500">
                    <span>Version {doc.version}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-gray-300 transition-colors group-hover:text-[#4ade80]">Read <ArrowUpRight size={14} aria-hidden="true" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-lg font-bold text-white">Need help with a policy?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">Contact the BuildEx legal team and include the document name in your message.</p>
          </div>
          <a href="mailto:legal@buildex.builders" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#4ade80] px-5 py-3 text-sm font-bold text-[#07120a] transition hover:bg-[#86efac]">legal@buildex.builders</a>
        </section>
      </div>
    </main>
  );
}
