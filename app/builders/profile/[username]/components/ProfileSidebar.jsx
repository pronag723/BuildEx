"use client";

import Link from "next/link";
import SocialLinks from "../../../components/SocialLinks";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { formatDate } from "../../../../../lib/i18n/format.mjs";
import { formatPrice } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import { experienceLabel, presenceLabel, responseLabel } from "./profileText";

function Tile({ value, label }) {
  return (
    <div className="rounded-xl bg-raised p-3">
      <p className="font-mark text-[1.3rem] font-bold leading-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-2">{label}</p>
    </div>
  );
}

function Row({ label, value, accent = false }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span className={`text-right ${accent ? "text-accent-ink" : "text-ink-2"}`}>{value}</span>
    </div>
  );
}

// Desktop sticky column: how to reach the builder, the numbers worth knowing
// before you do, and the start of their price list. Each block appears only
// when it has something true to say.
export default function ProfileSidebar({ builder, stats, tiers, isOwner, onContact, onShowPrices }) {
  const t = useT();
  const presence = presenceLabel(builder.online, builder.last_seen_at, t);
  const experience = experienceLabel(builder.building_since, t);
  const response = responseLabel(stats?.responseMinutes, t);
  const reviewsCount = stats?.reviewsCount ?? 0;
  const tiles = [
    reviewsCount > 0 && stats?.ratingAvg != null && {
      key: "rating",
      value: Number(stats.ratingAvg).toFixed(1),
      label: t("profile.reviews.count", { count: reviewsCount }),
    },
    response && { key: "response", value: response, label: t("profile.stats.responseLabel") },
  ].filter(Boolean);

  return (
    <div className="builder-sidebar-sticky space-y-3.5">
      <div className="card p-5">
        {presence && (
          <p className={`inline-flex items-center gap-2 text-[13.5px] ${builder.online ? "text-accent-ink" : "text-ink-2"}`}>
            <span className={`h-2 w-2 rounded-full ${builder.online ? "bg-accent" : "bg-line/30"}`} aria-hidden="true" />
            {presence}
          </p>
        )}
        {isOwner ? (
          <Link href="/account" className="btn btn-secondary btn-lg mt-3.5 w-full">
            <Icon name="pencil" size={16} />
            {t("profile.editOwn")}
          </Link>
        ) : (
          <button type="button" onClick={onContact} className="btn btn-primary btn-lg mt-3.5 w-full">
            <Icon name="chat" size={17} />
            {t("profile.contactBuilder")}
          </button>
        )}
        <SocialLinks
          contactLinks={builder.contact_links}
          variant="list"
          title={t("profile.links")}
          className="mt-4 border-t border-line/[0.08] pt-3.5"
        />
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("profile.stats.title")}</p>
        {tiles.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {tiles.map((tile) => (
              <Tile key={tile.key} value={tile.value} label={tile.label} />
            ))}
          </div>
        )}
        <div className="mt-3 space-y-2">
          {experience && <Row label={t("profile.stats.experience")} value={experience} />}
          {presence && <Row label={t("profile.stats.lastSeen")} value={presence} accent={builder.online} />}
          {builder.member_since && (
            <Row
              label={t("profile.stats.joined")}
              value={formatDate(builder.member_since, t.lang, { month: "long", year: "numeric" })}
            />
          )}
        </div>
      </div>

      {tiers.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-3">{t("profile.prices.title")}</p>
          <div className="mt-2">
            {tiers.slice(0, 3).map((tier) => (
              <div key={tier.id} className="flex justify-between gap-3 border-b border-line/[0.07] py-2 text-[13.5px] last:border-b-0">
                <span className="min-w-0 truncate text-ink-2">{tier.name}</span>
                <span className="whitespace-nowrap font-semibold text-accent-ink">
                  {t("profile.prices.fromValue", { price: formatPrice(tier.priceFromCents, t.lang) })}
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={onShowPrices} className="mt-2.5 text-[13.5px] font-semibold text-accent-ink hover:underline">
            {t("profile.prices.all")}
          </button>
        </div>
      )}
    </div>
  );
}
