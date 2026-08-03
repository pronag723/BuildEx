import Link from "next/link";
import { LEGAL_EFFECTIVE, legalDocuments, legalSlugs } from "./documents";

export const metadata = { title: "Legal Center | BuildEx", description: "BuildEx terms, policies, licenses, and legal notices." };

export default function LegalIndexPage() {
  return (
    <main className="min-h-screen bg-[#07070a] text-white px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">← Back to BuildEx</Link>
        <h1 className="mt-8 text-4xl font-black">BuildEx Legal Center</h1>
        <p className="mt-3 text-gray-400">Effective {LEGAL_EFFECTIVE}. Review the policies that apply to accounts, purchases, sellers, content, and privacy.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {legalSlugs.map((slug) => {
            const doc = legalDocuments[slug];
            return <Link key={slug} href={`/legal/${slug}/`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:border-violet-400/50"><h2 className="font-bold">{doc.title}</h2><p className="mt-2 text-sm text-gray-400">{doc.summary}</p><span className="mt-4 block text-xs text-gray-500">Version {doc.version}</span></Link>;
          })}
        </div>
        <p className="mt-10 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Pre-launch notice: the Legal Notice contains operator and governing-law fields that must be completed and professionally reviewed before publication.</p>
      </div>
    </main>
  );
}
