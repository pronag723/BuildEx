"use client";

import { useT } from "../../../lib/i18n/LanguageProvider";
import { FIRST_BUILD_YEAR, experienceYears } from "../../../lib/works/format.mjs";

// "Building since <year>". The profile turns it into "N years building", so it
// never goes stale the way a typed-in number of years would.
export default function ExperienceField({ value, onChange, id = "building-since" }) {
  const t = useT();
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= FIRST_BUILD_YEAR; y -= 1) years.push(y);
  const total = experienceYears(value);

  return (
    <div>
      <label htmlFor={id} className="onb-label mb-1.5 block">{t("account.experience.label")}</label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id={id}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
          className="onb-input w-auto min-w-[10rem]"
        >
          <option value="">{t("account.experience.none")}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {total != null && (
          <span className="text-sm text-ink-2">
            {total === 0 ? t("profile.experienceNew") : t("profile.experience", { count: total })}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{t("account.experience.hint")}</p>
    </div>
  );
}
