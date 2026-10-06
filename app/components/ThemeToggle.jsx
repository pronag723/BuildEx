"use client";

import { useTheme } from "../../lib/ui/useTheme";
import { Icon } from "../../lib/icons";
import { useT } from "../../lib/i18n/LanguageProvider";

// The header's light/dark switch. Shows the theme it will switch TO, the way
// most products do; renders an empty button of the same size until it has
// mounted and can read the real theme, so nothing jumps.
export default function ThemeToggle() {
  const { theme, isLight, toggleTheme } = useTheme();
  const t = useT();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn btn-ghost btn-icon"
      aria-label={t("common.toggleTheme")}
      title={t("common.toggleTheme")}
    >
      {theme && <Icon name={isLight ? "moon" : "sun"} size={17} />}
    </button>
  );
}
