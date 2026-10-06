"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "../../lib/icons";
import { useT } from "../../lib/i18n/LanguageProvider";

function safeReturnPath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/legal") ? path : "/";
}

export default function LegalReturnLink() {
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams.get("from"));
  const t = useT();

  return (
    <Link href={returnPath} className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
      <Icon name="arrowLeft" size={15} />
      {t("legal.back")}
    </Link>
  );
}
