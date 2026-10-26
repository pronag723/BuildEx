"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "../../../lib/i18n/LanguageProvider";
import { serverMessage } from "../../../lib/i18n/serverText.mjs";
import { fetchPriceTiers } from "../../../lib/works/api";
import { createPriceTier, deletePriceTier, reorderPriceTiers, updatePriceTier } from "../../../lib/works/edit";
import { formatPrice } from "../../../lib/works/format.mjs";
import { Icon } from "../../../lib/icons";
import { tierDuration } from "../../builders/profile/[username]/components/PriceList";

export const PRICE_TIERS_MAX = 12;

const emptyForm = { name: "", description: "", daysMin: "", daysMax: "", priceFrom: "" };

const formFrom = (tier) => ({
  name: tier.name,
  description: tier.description || "",
  daysMin: tier.daysMin ? String(tier.daysMin) : "",
  daysMax: tier.daysMax ? String(tier.daysMax) : "",
  priceFrom: String(tier.priceFromCents / 100),
});

function TierForm({ initial, onSave, onCancel, saving }) {
  const t = useT();
  const [form, setForm] = useState(initial);
  const digits = (key, max) => (event) => setForm((f) => ({ ...f, [key]: event.target.value.replace(/\D/g, "").slice(0, max) }));
  const price = Number(form.priceFrom);
  const daysOk = !form.daysMin || !form.daysMax || Number(form.daysMin) <= Number(form.daysMax);
  const valid = form.name.trim().length > 0 && price >= 1 && price <= 100000 && daysOk;

  return (
    <div className="space-y-3 rounded-xl border border-line/[0.1] p-3">
      <div>
        <label className="onb-label mb-1 block" htmlFor="tier-name">{t("account.prices.name")}</label>
        <input id="tier-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 60) }))} placeholder={t("account.prices.namePlaceholder")} className="onb-input" />
      </div>
      <div>
        <label className="onb-label mb-1 block" htmlFor="tier-description">{t("account.prices.description")}</label>
        <textarea id="tier-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, 300) }))} placeholder={t("account.prices.descriptionPlaceholder")} className="onb-input onb-textarea min-h-[4.5rem]" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="onb-label mb-1 block" htmlFor="tier-price">{t("account.prices.priceFrom")}</label>
          <input id="tier-price" inputMode="decimal" value={form.priceFrom} onChange={(e) => setForm((f) => ({ ...f, priceFrom: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) }))} placeholder="150" className="onb-input" />
        </div>
        <div>
          <label className="onb-label mb-1 block" htmlFor="tier-days-min">{t("account.prices.daysMin")}</label>
          <input id="tier-days-min" inputMode="numeric" value={form.daysMin} onChange={digits("daysMin", 3)} placeholder="7" className="onb-input" />
        </div>
        <div>
          <label className="onb-label mb-1 block" htmlFor="tier-days-max">{t("account.prices.daysMax")}</label>
          <input id="tier-days-max" inputMode="numeric" value={form.daysMax} onChange={digits("daysMax", 3)} placeholder="14" className="onb-input" />
        </div>
      </div>
      {!daysOk && <p className="text-xs text-warn">{t("account.prices.daysOrder")}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(form)} disabled={!valid || saving} className="btn btn-primary btn-sm">
          {t("account.prices.save")}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
      </div>
    </div>
  );
}

// The builder's own price list: named tiers with a "from" price in USD and an
// optional duration. Shown on the profile's Prices tab and in the sidebar.
export default function PriceTiersEditor({ userId }) {
  const t = useT();
  const [tiers, setTiers] = useState(null);
  const [editing, setEditing] = useState(null); // tier id, or "new"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { tiers: rows } = await fetchPriceTiers(userId);
    setTiers(rows);
  }, [userId]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const save = async (form) => {
    setSaving(true);
    setError(null);
    const { error: e } =
      editing === "new"
        ? await createPriceTier(userId, form, tiers.length)
        : await updatePriceTier(editing, form);
    setSaving(false);
    if (e) {
      setError(serverMessage(e, "account.errors.saveFailed"));
      return;
    }
    setEditing(null);
    load();
  };

  const remove = async (tier) => {
    const { error: e } = await deletePriceTier(tier.id);
    if (e) setError(serverMessage(e, "account.errors.saveFailed"));
    load();
  };

  const move = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= tiers.length) return;
    const next = tiers.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setTiers(next);
    const { error: e } = await reorderPriceTiers(next.map((tier) => tier.id));
    if (e) setError(serverMessage(e, "account.errors.saveFailed"));
  };

  if (tiers === null) return <div className="h-16 rounded-xl skeleton" />;

  return (
    <div className="space-y-2.5">
      {tiers.length === 0 && editing !== "new" && (
        <p className="rounded-xl border border-dashed border-line/15 p-5 text-center text-sm text-ink-3">{t("account.prices.empty")}</p>
      )}
      {tiers.map((tier, index) =>
        editing === tier.id ? (
          <TierForm key={tier.id} initial={formFrom(tier)} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
        ) : (
          <div key={tier.id} className="flex items-center gap-3 rounded-xl border border-line/[0.08] bg-raised/60 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{tier.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-3">
                {t("profile.prices.fromValue", { price: formatPrice(tier.priceFromCents, t.lang) })}
                {tierDuration(tier, t) ? ` · ${tierDuration(tier, t)}` : ""}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn btn-ghost btn-icon btn-sm disabled:opacity-30" aria-label={t("account.works.moveUp")}>
                <Icon name="chevronLeft" size={15} className="rotate-90" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === tiers.length - 1} className="btn btn-ghost btn-icon btn-sm disabled:opacity-30" aria-label={t("account.works.moveDown")}>
                <Icon name="chevronRight" size={15} className="rotate-90" />
              </button>
              <button type="button" onClick={() => setEditing(tier.id)} className="btn btn-ghost btn-icon btn-sm" aria-label={t("common.edit")}>
                <Icon name="pencil" size={15} />
              </button>
              <button type="button" onClick={() => remove(tier)} className="btn btn-ghost btn-icon btn-sm text-danger" aria-label={t("account.prices.delete")}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          </div>
        )
      )}
      {editing === "new" ? (
        <TierForm initial={emptyForm} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
      ) : (
        tiers.length < PRICE_TIERS_MAX && (
          <button type="button" onClick={() => setEditing("new")} className="btn btn-secondary w-full">
            <Icon name="plus" size={16} />
            {t("account.prices.add")}
          </button>
        )
      )}
      <p className="text-xs text-ink-3">{t("account.prices.hint")}</p>
      {error && <div role="alert" className="auth-banner auth-banner-error">{error}</div>}
    </div>
  );
}
