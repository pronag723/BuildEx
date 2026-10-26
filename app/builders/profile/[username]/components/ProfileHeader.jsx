"use client";

import Link from "next/link";
import Avatar from "../../../../../lib/ui/Avatar";
import SaveButton from "../../../../../lib/ui/SaveButton";
import SocialLinks from "../../../components/SocialLinks";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { formatDate } from "../../../../../lib/i18n/format.mjs";
import { formatCount } from "../../../../../lib/works/format.mjs";
import { Icon } from "../../../../../lib/icons";
import { experienceLabel, presenceLabel } from "./profileText";

// One counter in the Instagram-style row: the number over its label. The label
// is pluralised by the count but carries no number of its own.
function Counter({ value, labelKey, className = "" }) {
  const t = useT();
  return (
    <div className={`flex flex-col items-center gap-0.5 lg:flex-row lg:items-baseline lg:gap-1.5 ${className}`}>
      <span className="font-mark text-[1.2rem] font-bold leading-none text-ink lg:text-[1.125rem]">
        {formatCount(value, t.lang)}
      </span>
      <span className="text-xs text-ink-2 lg:text-[14.5px]">{t(labelKey, { count: value })}</span>
    </div>
  );
}

// Identity, counters and the primary actions. On a phone the avatar sits beside
// the counters with everything else below; from `lg` the right column carries
// the name row, counters and description, and the message button and links
// move to the sticky sidebar.
//
// `editor` is the owner's /account editor filling the same layout with
// editable blocks: { avatar, name, bio, meta, links } nodes. It has no
// counters and no visitor actions, so on a phone the name block takes the
// counters' place beside the avatar.
export default function ProfileHeader({
  builder,
  stats,
  isOwner,
  onContact,
  onShare,
  canFavorite,
  favorited,
  onToggleFavorite,
  actionsRef,
  editor = null,
}) {
  const t = useT();
  const worksCount = stats?.worksCount ?? 0;
  const likesTotal = stats?.likesTotal ?? 0;
  const viewsTotal = stats?.viewsTotal ?? 0;
  const reviewsCount = stats?.reviewsCount ?? 0;
  const experience = experienceLabel(builder.building_since, t);
  const presence = presenceLabel(builder.online, builder.last_seen_at, t);
  const memberSince = builder.member_since
    ? t("profile.memberSinceMonth", {
        date: formatDate(builder.member_since, t.lang, { month: "long", year: "numeric" }),
      })
    : null;

  const favoriteButton = (withLabel) =>
    canFavorite && builder.id ? (
      <SaveButton
        saved={favorited}
        onToggle={onToggleFavorite}
        size={16}
        aria-label={favorited ? t("card.removeFavorite") : t("card.addFavorite")}
        className={withLabel ? "btn btn-secondary" : "btn btn-secondary btn-icon"}
      >
        {withLabel && <span>{favorited ? t("profile.saved") : t("profile.save")}</span>}
      </SaveButton>
    ) : null;

  const shareButton = (
    <button type="button" onClick={onShare} className="btn btn-secondary btn-icon" aria-label={t("profile.share.button")}>
      <Icon name="share" size={16} />
    </button>
  );

  if (editor) {
    return (
      <header className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 lg:gap-x-7">
        <div className="relative self-center lg:row-span-2 lg:self-start">{editor.avatar}</div>
        <div className="min-w-0 self-center lg:self-start">{editor.name}</div>
        <div className="col-span-2 mt-3.5 min-w-0 lg:col-span-1 lg:col-start-2 lg:mt-3">
          {editor.bio}
          {editor.meta}
          {editor.links}
        </div>
      </header>
    );
  }

  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 lg:gap-x-7">
      {/* Avatar with the online dot. */}
      <div className="relative self-center lg:row-span-2 lg:self-start">
        <Avatar
          src={builder.avatar}
          name={builder.display_name}
          alt={builder.display_name}
          className="h-[86px] w-[86px] rounded-[22px] text-3xl lg:h-[120px] lg:w-[120px] lg:rounded-[30px] lg:text-5xl"
        />
        {builder.online && (
          <span
            aria-label={t("card.onlineNow")}
            className="absolute -bottom-1 -right-1 h-[18px] w-[18px] rounded-full border-[3px] border-canvas bg-accent lg:bottom-0 lg:right-0 lg:h-6 lg:w-6 lg:border-4"
          />
        )}
      </div>

      <div className="min-w-0 self-center lg:self-start">
        {/* Name row with Save / Share — desktop only; the phone has its own below. */}
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 lg:flex">
          <h1 className="break-words text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
            {builder.display_name}
          </h1>
          <span className="text-[15px] text-ink-3">@{builder.username}</span>
          <div className="ml-auto flex gap-2">
            {favoriteButton(true)}
            {shareButton}
          </div>
        </div>

        <div className="flex justify-around gap-2 lg:mt-3 lg:justify-start lg:gap-8">
          <Counter value={worksCount} labelKey="profile.stats.works" />
          <Counter value={likesTotal} labelKey="profile.stats.likes" />
          {viewsTotal > 0 && <Counter value={viewsTotal} labelKey="profile.stats.views" />}
          {reviewsCount > 0 && <Counter value={reviewsCount} labelKey="profile.stats.reviews" />}
        </div>
      </div>

      <div className="col-span-2 mt-3.5 min-w-0 lg:col-span-1 lg:col-start-2 lg:mt-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 lg:hidden">
          <h1 className="break-words text-[1.125rem] font-semibold tracking-[-0.01em]">{builder.display_name}</h1>
          <span className="text-sm text-ink-3">@{builder.username}</span>
        </div>

        {builder.bio && (
          <p className="mt-1.5 max-w-[680px] whitespace-pre-line break-words text-sm leading-relaxed text-ink-2 lg:mt-0 lg:text-[14.5px]">
            {builder.bio}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
          {experience && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="briefcase" size={14} className="text-ink-3" /> {experience}
            </span>
          )}
          {memberSince && (
            <span className="hidden items-center gap-1.5 lg:inline-flex">
              <Icon name="calendar" size={14} className="text-ink-3" /> {memberSince}
            </span>
          )}
          {presence && (
            <span className={`inline-flex items-center gap-1.5 lg:hidden ${builder.online ? "text-accent-ink" : ""}`}>
              <span className={`h-[7px] w-[7px] rounded-full ${builder.online ? "bg-accent" : "bg-line/30"}`} aria-hidden="true" />
              {presence}
            </span>
          )}
        </div>

        {/* Phone: links and actions here; from `lg` they live in the sidebar. */}
        <SocialLinks contactLinks={builder.contact_links} className="mt-3 lg:hidden" />

        <div ref={actionsRef} className="mt-3.5 flex gap-2 lg:hidden">
          {isOwner ? (
            <Link href="/account" className="btn btn-secondary flex-1">
              <Icon name="pencil" size={16} />
              {t("profile.editOwn")}
            </Link>
          ) : (
            <button type="button" onClick={onContact} className="btn btn-primary flex-1">
              <Icon name="chat" size={17} />
              {t("profile.contactBuilder")}
            </button>
          )}
          {favoriteButton(false)}
          {shareButton}
        </div>
      </div>
    </header>
  );
}
