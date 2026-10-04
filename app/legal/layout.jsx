import Link from "next/link";
import SiteFooter from "../home/components/SiteFooter";
import LegalHeaderControls from "./LegalHeaderControls";

export default function LegalLayout({ children }) {
  return (
    <div className="legal-shell relative min-h-screen overflow-hidden bg-[#080b09] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_5%,rgba(74,222,128,0.11),transparent_30%),radial-gradient(circle_at_90%_45%,rgba(74,222,128,0.06),transparent_28%)]" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:64px_64px]" aria-hidden="true" />
      <header className="relative z-20 border-b border-white/[0.07] bg-[#080b09]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="nav-logo-text !ml-0 text-xl font-bold tracking-tight text-white no-underline">Build<span className="font-extrabold text-[#4ade80]">Ex</span></Link>
          <LegalHeaderControls />
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}
