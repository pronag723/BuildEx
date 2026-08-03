"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";

function safeReturnPath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/legal") ? path : "/";
}

export default function LegalReturnLink() {
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams.get("from"));

  return (
    <Link href={returnPath} className="group inline-flex items-center gap-2 text-sm font-semibold text-gray-400 transition hover:text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition group-hover:border-[#4ade80]/40 group-hover:text-[#4ade80]"><ArrowLeft size={15} aria-hidden="true" /></span>
      Back to BuildEx
    </Link>
  );
}
