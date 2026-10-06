"use client";

// The colour theme: "dark" (default) or "light", stored in localStorage under
// "theme" and expressed as a class on <html>.
//
// The boot script in app/layout.js applies the stored class before first
// paint, so this hook only has to read what is already there and keep the
// class, the storage and its own state in step when the toggle is used. Every
// page used to carry its own copy of this logic (plus an animated-background
// loop that CSS had already switched off); the header's ThemeToggle is now the
// only caller.

import { useCallback, useEffect, useState } from "react";

const KEY = "theme";

function currentTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme !== "light");
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or blocked storage: the switch still works for this visit.
  }
}

export function useTheme() {
  // null until mounted, so the server render and the first client render agree.
  const [theme, setThemeState] = useState(null);

  useEffect(() => {
    setThemeState(currentTheme());
  }, []);

  const setTheme = useCallback((next) => {
    const value = typeof next === "function" ? next(currentTheme()) : next;
    const resolved = value === "light" ? "light" : "dark";
    applyTheme(resolved);
    setThemeState(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, [setTheme]);

  return { theme, isLight: theme === "light", setTheme, toggleTheme };
}
