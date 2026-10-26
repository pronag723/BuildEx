"use client";

import { useT } from "../../../lib/i18n/LanguageProvider";
import YearPicker, { yearsText } from "../../../lib/ui/YearPicker";

// "Building since <year>". The profile turns it into "N years building", so it
// never goes stale the way a typed-in number of years would. The year comes
// from the same popover grid the profile editor uses.
export default function ExperienceField({ value, onChange, id = "building-since" }) {
  const t = useT();
  const span = yearsText(value, t);

  return (
    <div>
      <label htmlFor={id} className="onb-label mb-1.5 block">{t("account.experience.label")}</label>
      <div className="flex flex-wrap items-center gap-3">
        <YearPicker id={id} variant="field" value={value} onChange={onChange} />
        {span && <span className="text-sm text-ink-2">{span}</span>}
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{t("account.experience.hint")}</p>
    </div>
  );
}
