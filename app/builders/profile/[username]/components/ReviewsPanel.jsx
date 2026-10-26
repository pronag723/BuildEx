"use client";

import { useCallback, useEffect, useState } from "react";
import Avatar from "../../../../../lib/ui/Avatar";
import { publicAsset } from "../../../../home/utils";
import { useT } from "../../../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../../../lib/i18n/serverText.mjs";
import { relativeAgo } from "../../../../../lib/works/format.mjs";
import {
  REVIEWS_PAGE_SIZE,
  REVIEW_STATUS,
  canReview,
  deleteMyReview,
  fetchReviews,
  reportReview,
  upsertReview,
} from "../../../../../lib/reviews/api";
import { Icon } from "../../../../../lib/icons";

const BODY_MIN = 20;
const BODY_MAX = 1500;

function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5 text-warn" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled={n <= Math.round(value)} className={n <= Math.round(value) ? "" : "text-line/30"} />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }) {
  const t = useT();
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={t("profile.reviews.rating")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("profile.reviews.ratingValue", { n })}
          onClick={() => onChange(n)}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-line/[0.06] ${
            n <= value ? "text-warn" : "text-line/35"
          }`}
        >
          <Icon name="star" size={22} filled={n <= value} />
        </button>
      ))}
    </div>
  );
}

// Write or edit the caller's review. The server re-checks everything shown
// here and its message, mapped to the interface language, is what we display.
function ReviewForm({ builderId, existing, tiers, onSaved, onCancel }) {
  const t = useT();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [tierId, setTierId] = useState(existing?.tierId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const length = body.trim().length;
  const valid = rating >= 1 && length >= BODY_MIN && length <= BODY_MAX;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await upsertReview(builderId, { rating, body: body.trim(), tierId: tierId || null });
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "profile.reviews.saveFailed"));
      return;
    }
    onSaved();
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await deleteMyReview(builderId);
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "profile.reviews.saveFailed"));
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <StarPicker value={rating} onChange={setRating} />
      <div>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, BODY_MAX))}
          rows={4}
          placeholder={t("profile.reviews.bodyPlaceholder")}
          className="input min-h-[6rem] w-full resize-y py-2.5"
          aria-label={t("profile.reviews.body")}
        />
        <p className={`mt-1 text-right text-[11px] ${length > 0 && length < BODY_MIN ? "text-warn" : "text-ink-3"}`}>
          {length < BODY_MIN
            ? t("profile.reviews.minChars", { n: BODY_MIN - length })
            : `${length} / ${BODY_MAX}`}
        </p>
      </div>
      {tiers.length > 0 && (
        <label className="block text-[13px] text-ink-2">
          <span className="mb-1 block">{t("profile.reviews.tier")}</span>
          <select value={tierId} onChange={(event) => setTierId(event.target.value)} className="input w-full">
            <option value="">{t("profile.reviews.tierNone")}</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>{tier.name}</option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!valid || busy} className="btn btn-primary">
          {existing ? t("profile.reviews.update") : t("profile.reviews.submit")}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t("common.cancel")}
        </button>
        {existing && (
          <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost ml-auto text-danger">
            <Icon name="trash" size={15} /> {t("profile.reviews.delete")}
          </button>
        )}
      </div>
    </form>
  );
}

function ReportForm({ reviewId, onDone }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await reportReview(reviewId, reason.trim());
    setBusy(false);
    if (e) {
      setError(serverMessage(e, "profile.reviews.reportFailed"));
      return;
    }
    onDone(true);
  };

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value.slice(0, 2000))}
        rows={2}
        placeholder={t("profile.reviews.reportPlaceholder")}
        className="input w-full resize-none py-2"
        aria-label={t("profile.reviews.report")}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={!reason.trim() || busy} className="btn btn-secondary btn-sm">
          {t("profile.reviews.reportSend")}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn btn-ghost btn-sm">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ review, canReport }) {
  const t = useT();
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const name = review.reviewer?.displayName || t("admin.reports.user");

  return (
    <li className="card p-4">
      <div className="flex items-center gap-2.5">
        <Avatar src={review.reviewer?.avatarUrl ? publicAsset(review.reviewer.avatarUrl) : null} name={name} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-3">
            {review.tier ? `${review.tier.name} · ` : ""}
            {relativeAgo(review.createdAt, t.lang)}
          </p>
        </div>
        <Stars value={review.rating} size={13} />
      </div>
      {review.hidden && (
        <p className="mt-2.5 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs text-warn">{t("profile.reviews.hiddenNotice")}</p>
      )}
      <p className="mt-2.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{review.body}</p>
      {canReport && !reporting && (
        <div className="mt-2 flex justify-end">
          {reported ? (
            <span className="text-xs text-ink-3">{t("profile.reviews.reported")}</span>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2">
              <Icon name="flag" size={12} /> {t("profile.reviews.report")}
            </button>
          )}
        </div>
      )}
      {reporting && (
        <ReportForm
          reviewId={review.id}
          onDone={(sent) => {
            setReporting(false);
            if (sent) setReported(true);
          }}
        />
      )}
    </li>
  );
}

// Reviews: a summary, the caller's own form when they qualify (a real chat
// with this builder — the server decides), and the list.
export default function ReviewsPanel({ builderId, userId, isOwner, tiers, ratingAvg, onChanged, onSignIn }) {
  const t = useT();
  const [reviews, setReviews] = useState(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [eligibility, setEligibility] = useState({ status: null, review: null });
  const [editing, setEditing] = useState(false);

  const loadFirstPage = useCallback(() => {
    fetchReviews(builderId).then(({ reviews: rows, count }) => {
      setReviews(rows);
      setTotal(count);
    });
  }, [builderId]);

  const loadEligibility = useCallback(() => {
    if (!userId || isOwner) {
      setEligibility({ status: userId ? REVIEW_STATUS.self : REVIEW_STATUS.notSignedIn, review: null });
      return;
    }
    canReview(builderId).then(({ status, review }) => setEligibility({ status, review }));
  }, [builderId, userId, isOwner]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    loadEligibility();
  }, [loadEligibility]);

  const loadMore = async () => {
    if (loadingMore || !reviews) return;
    setLoadingMore(true);
    const { reviews: rows } = await fetchReviews(builderId, {
      from: reviews.length,
      to: reviews.length + REVIEWS_PAGE_SIZE - 1,
    });
    setReviews((list) => [...(list || []), ...rows]);
    setLoadingMore(false);
  };

  const onSaved = () => {
    setEditing(false);
    loadFirstPage();
    loadEligibility();
    onChanged?.();
  };

  const { status, review: mine } = eligibility;
  const canWrite = status === REVIEW_STATUS.ok;
  const hintKey = {
    [REVIEW_STATUS.notSignedIn]: "profile.reviews.hint.signIn",
    [REVIEW_STATUS.noConversation]: "profile.reviews.hint.noConversation",
    [REVIEW_STATUS.tooSoon]: "profile.reviews.hint.tooSoon",
  }[status];

  return (
    <div className="space-y-3">
      {total > 0 && ratingAvg != null && (
        <div className="card flex items-center gap-3.5 p-4">
          <span className="font-mark text-[2.125rem] font-bold leading-none text-ink">
            {Number(ratingAvg).toFixed(1)}
          </span>
          <div>
            <Stars value={ratingAvg} size={15} />
            <p className="mt-1 text-[12.5px] text-ink-2">{t("profile.reviews.count", { count: total })}</p>
          </div>
        </div>
      )}

      {editing ? (
        <ReviewForm
          builderId={builderId}
          existing={mine}
          tiers={tiers}
          onSaved={onSaved}
          onCancel={() => setEditing(false)}
        />
      ) : canWrite ? (
        <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary w-full">
          <Icon name={mine ? "pencil" : "star"} size={16} />
          {mine ? t("profile.reviews.edit") : t("profile.reviews.write")}
        </button>
      ) : hintKey ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line/[0.08] px-4 py-3 text-[13px] text-ink-2">
          <Icon name="chat" size={16} className="text-ink-3" />
          <span className="min-w-0 flex-1">{t(hintKey)}</span>
          {status === REVIEW_STATUS.notSignedIn && (
            <button type="button" onClick={onSignIn} className="btn btn-secondary btn-sm">
              {t("profile.reviews.signIn")}
            </button>
          )}
        </div>
      ) : null}

      {reviews === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-28 rounded-xl skeleton" />)}
        </div>
      ) : reviews.length === 0 ? (
        <div className="block-grid flex min-h-[8rem] items-center justify-center rounded-xl px-6 text-center text-sm text-ink-3">
          {isOwner ? t("profile.reviews.emptyOwn") : t("profile.reviews.empty")}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 lg:grid-cols-2">
            {reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                canReport={Boolean(userId) && review.reviewerId !== userId}
              />
            ))}
          </ul>
          {reviews.length < total && (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="btn btn-secondary w-full">
              {t("profile.reviews.showMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
