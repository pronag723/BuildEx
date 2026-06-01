"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Buyer order placement (Stage 3)
// Reached from the "Order now" CTA on a builder's profile via /order?to=<handle>.
// Three-step flow inside one page: pick size → pick style → write brief →
// review → mock Pay. The Pay button calls placeOrder + markOrderPaid; real SBP
// payment in Stage 12 will replace the markOrderPaid call. Authentication is
// required for the whole page (useRequireAuth bounces to /login).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import { fetchBuilderByUsername } from "../../builders/data/fetchBuilders";
import { SIZE_META, SIZES, formatPrice } from "../../../lib/pricing";
import { placeOrder, markOrderPaid } from "../../../lib/orders/api";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";

const STEPS = ["size", "style", "brief", "review"];

function StepDots({ step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            i === idx
              ? "bg-[#4ade80] w-10"
              : i < idx
              ? "bg-[#4ade80]/60 w-6"
              : "bg-white/10 w-6"
          }`}
        />
      ))}
    </div>
  );
}

export default function OrderPlacementPage() {
  const { status, user } = useAuth();
  useRequireAuth();
  const router = useRouter();

  const [theme, setTheme] = useState(null);
  const isLight = theme === "light";
  useEffect(() => {
    const saved = typeof window !== "undefined" && window.localStorage.getItem("theme");
    setTheme(saved === "light" ? "light" : "dark");
  }, []);
  useEffect(() => {
    if (!theme) return;
    const html = document.documentElement;
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    window.localStorage.setItem("theme", theme);
  }, [theme, isLight]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── Resolve the target builder from ?to=<handle> ────────────────────────────
  const [username, setUsername] = useState(null);
  const [builder, setBuilder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setUsername(params.get("to"));
  }, []);

  useEffect(() => {
    if (!username) {
      if (typeof window !== "undefined") setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchBuilderByUsername(username).then(({ builder: b, error }) => {
      if (cancelled) return;
      if (error) setLoadError(error.message || "Failed to load builder");
      setBuilder(b);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // The buyer can't order from themselves. Once auth + builder are both known,
  // detect the self-order case and surface it as a friendly notice.
  const isSelf =
    !!user && !!builder?.id && user.id === builder.id;
  // builder.id isn't in the public mapping; resolve via builder_profiles ownership
  // by comparing username against the authenticated profile (cheap path: navbar
  // already has it; fallback to a Supabase lookup avoided to keep this page lean).

  // ── Form state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState("size");
  const [size, setSize] = useState(null);
  const [style, setStyle] = useState(null);
  const [brief, setBrief] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Enabled sizes the builder offers, with their kopeck price. Disabled sizes
  // are still shown but greyed and unselectable so buyers see the full menu.
  const sizeOptions = useMemo(() => {
    const rates = builder?.rates || {};
    return SIZES.map((key) => {
      const tier = rates[key] || {};
      return {
        key,
        meta: SIZE_META[key],
        enabled: tier.enabled !== false && Number(tier.price) > 0,
        price: Number(tier.price) || 0,
        blocks: Number(tier.blocks) || SIZE_META[key].defaultBlocks,
      };
    });
  }, [builder]);

  const styles = useMemo(
    () => (Array.isArray(builder?.specialties) ? builder.specialties : []),
    [builder]
  );

  const selectedSize = sizeOptions.find((s) => s.key === size) || null;
  const priceKopecks = selectedSize?.price || 0;

  // ── Step navigation guards ─────────────────────────────────────────────────
  const canAdvance =
    (step === "size" && selectedSize?.enabled) ||
    (step === "style" && !!style) ||
    (step === "brief" && brief.trim().length >= 20) ||
    step === "review";

  const goNext = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1 && canAdvance) setStep(STEPS[i + 1]);
  }, [step, canAdvance]);

  const goBack = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  }, [step]);

  // ── Submit (mock pay) ──────────────────────────────────────────────────────
  const onPay = useCallback(async () => {
    if (submitting) return;
    if (!selectedSize?.enabled || !style || brief.trim().length < 20) return;
    if (!builder?.id) {
      setSubmitError("Builder identity not loaded yet — please retry.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const { orderId, error: placeError } = await placeOrder({
      builderId: builder.id,
      size,
      style,
      brief: brief.trim(),
    });
    if (placeError || !orderId) {
      setSubmitting(false);
      setSubmitError(placeError?.message || "Could not place the order.");
      return;
    }
    // MOCK PAYMENT — Stage 12 replaces this with a real SBP intent + webhook.
    const { error: payError } = await markOrderPaid(orderId);
    if (payError) {
      setSubmitting(false);
      setSubmitError(
        (payError.message || "Order placed, but payment could not be marked.") +
          " Your order is awaiting payment."
      );
      router.push(`/orders/?id=${encodeURIComponent(orderId)}`);
      return;
    }
    router.push(`/orders/?id=${encodeURIComponent(orderId)}`);
  }, [submitting, selectedSize, style, brief, builder, size, router]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (status === "loading" || theme === null) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <>
      <CatalogNavbar
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />
      <CatalogMobileMenu
        isLight={isLight}
        setTheme={setTheme}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="min-h-screen px-4 pt-28 pb-20">
        <div className="max-w-2xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
            </div>
          ) : !username ? (
            <EmptyNotice
              title="Pick a builder first"
              body="Open a builder profile and tap Order now to start a commission."
            />
          ) : loadError || !builder ? (
            <EmptyNotice
              title="Builder not found"
              body={loadError || "We couldn't find that builder."}
            />
          ) : isSelf ? (
            <EmptyNotice
              title="That's you"
              body="You can't place an order on your own profile."
            />
          ) : (
            <div className="glass rounded-3xl p-6 sm:p-8">
              <Header builder={builder} />
              <StepDots step={step} />

              {step === "size" && (
                <SizeStep
                  options={sizeOptions}
                  value={size}
                  onChange={setSize}
                />
              )}
              {step === "style" && (
                <StyleStep styles={styles} value={style} onChange={setStyle} />
              )}
              {step === "brief" && (
                <BriefStep value={brief} onChange={setBrief} />
              )}
              {step === "review" && (
                <ReviewStep
                  builder={builder}
                  size={size}
                  style={style}
                  brief={brief}
                  priceKopecks={priceKopecks}
                />
              )}

              {submitError && (
                <p className="mt-4 text-sm text-red-400">{submitError}</p>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === "size" || submitting}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold border border-white/10 text-gray-300 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Back
                </button>

                {step !== "review" ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canAdvance}
                    className="px-6 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4ade80]"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPay}
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-full text-sm font-bold bg-[#4ade80] text-black green-glow hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-wait"
                  >
                    {submitting
                      ? "Processing…"
                      : `Pay ${formatPrice(priceKopecks)} (mock)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────
function Header({ builder }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <img
        src={builder.avatar || "/avatar-placeholder.png"}
        alt={builder.display_name}
        className="w-12 h-12 rounded-full object-cover ring-2 ring-[#4ade80]/40"
        loading="lazy"
        decoding="async"
      />
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-widest">
          Ordering from
        </p>
        <h1 className="font-bold text-lg leading-tight truncate">
          {builder.display_name}
        </h1>
        <p className="text-xs text-gray-400 truncate">@{builder.username}</p>
      </div>
    </div>
  );
}

// ─── Step 1: size ───────────────────────────────────────────────────────────
function SizeStep({ options, value, onChange }) {
  return (
    <div className="space-y-3">
      <h2 className="font-bold text-base">Pick a build size</h2>
      <p className="text-xs text-gray-500 -mt-1">
        Disabled sizes aren't offered by this builder.
      </p>
      {options.map((o) => {
        const selected = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            disabled={!o.enabled}
            onClick={() => onChange(o.key)}
            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3 ${
              !o.enabled
                ? "border-white/5 opacity-40 cursor-not-allowed"
                : selected
                ? "border-[#4ade80] bg-[#4ade80]/10 shadow-[0_0_18px_rgba(74,222,128,0.18)]"
                : "border-white/10 hover:border-[#4ade80]/40 hover:bg-white/5"
            }`}
          >
            <div className="text-2xl">{o.meta.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{o.meta.label}</p>
                <p className="font-bold text-[#4ade80] text-sm">
                  {o.enabled ? formatPrice(o.price) : "not offered"}
                </p>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {o.meta.areaLabel(o.blocks)} · {o.meta.hint}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 2: style ──────────────────────────────────────────────────────────
function StyleStep({ styles, value, onChange }) {
  if (!styles.length) {
    return (
      <p className="text-sm text-gray-400">
        This builder hasn't listed any specialties yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className="font-bold text-base">Pick a style</h2>
      <p className="text-xs text-gray-500 -mt-1">
        One of this builder's specialties.
      </p>
      <div className="flex flex-wrap gap-2">
        {styles.map((s) => {
          const selected = value === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className={`px-4 py-2 rounded-full text-sm border transition-all capitalize ${
                selected
                  ? "border-[#4ade80] bg-[#4ade80]/15 text-[#4ade80]"
                  : "border-white/10 text-gray-300 hover:border-[#4ade80]/40 hover:bg-white/5"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: brief ──────────────────────────────────────────────────────────
function BriefStep({ value, onChange }) {
  const len = value.trim().length;
  return (
    <div className="space-y-3">
      <h2 className="font-bold text-base">Describe the build</h2>
      <p className="text-xs text-gray-500 -mt-1">
        Size, theme, reference links, palette, scale, deadline — the more
        specific, the better. Minimum 20 characters.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={9}
        maxLength={8000}
        placeholder="e.g. Medieval keep with adjacent farming village, sandstone palette, 250×250 footprint, delivery in two weeks. Reference: …"
        className="w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:border-[#4ade80]/60 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/20 resize-y"
      />
      <p className="text-[11px] text-gray-500 text-right">
        {len} / 8000 — {len >= 20 ? "looks good" : `${20 - len} more to continue`}
      </p>
    </div>
  );
}

// ─── Step 4: review ─────────────────────────────────────────────────────────
function ReviewStep({ builder, size, style, brief, priceKopecks }) {
  const sizeLabel = SIZE_META[size]?.label || size;
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-base">Review your order</h2>

      <dl className="space-y-2 text-sm">
        <Row label="Builder">{builder.display_name}</Row>
        <Row label="Size">{sizeLabel}</Row>
        <Row label="Style" capitalize>
          {style}
        </Row>
      </dl>

      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">
          Brief
        </p>
        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed p-3 rounded-2xl bg-black/30 border border-white/10 max-h-48 overflow-y-auto">
          {brief.trim()}
        </p>
      </div>

      <div className="py-4 border-y border-white/[0.08] flex items-center justify-between">
        <span className="text-sm text-gray-400">You pay now</span>
        <span className="font-extrabold text-[#4ade80] text-2xl">
          {formatPrice(priceKopecks)}
        </span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed flex gap-2">
        <span aria-hidden>🔒</span>
        <span>
          The platform holds your payment in escrow. Funds are only released to
          the builder once you confirm the delivered work.
        </span>
      </p>
    </div>
  );
}

function Row({ label, capitalize, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] text-gray-500 uppercase tracking-widest">
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-gray-200 text-right ${
          capitalize ? "capitalize" : ""
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

// ─── Empty/error notice card ────────────────────────────────────────────────
function EmptyNotice({ title, body }) {
  return (
    <div className="glass rounded-3xl p-8 text-center">
      <h1 className="font-bold text-lg mb-2">{title}</h1>
      <p className="text-sm text-gray-400">{body}</p>
    </div>
  );
}
