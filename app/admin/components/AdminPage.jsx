"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Admin console
// A dedicated operator surface for admins (profiles.is_admin). The order and
// dispute moderation tabs were removed together with the payment layer; what
// remains is the auth gate, the shell, and the studios program console.
// A proper moderation console (users, profiles, chat) is rebuilt in Stage 7.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../lib/auth/AuthContext";
import { useRequireAuth } from "../../../lib/auth/useRequireAuth";
import CatalogNavbar from "../../builders/components/CatalogNavbar";
import CatalogMobileMenu from "../../builders/components/CatalogMobileMenu";
import { useGradientBackground } from "../../../lib/ui/useGradientBackground";
import StudiosConsole from "./StudiosConsole";

export default function AdminPage() {
  useRequireAuth();
  const { profile, status } = useAuth();
  const isAdmin = profile?.is_admin === true;

  const [theme, setTheme] = useState(null);
  const isLight = theme === "light";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { gradientRef, edgeGlowRef } = useGradientBackground();
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

  const ready = status === "authenticated" && theme !== null;

  return (
    <div
      className={`builder-profile-root ${isLight ? "light" : ""} catalog-root min-h-screen flex flex-col`}
    >
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />

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

      <main className="relative z-10 flex-1 px-4 pt-28 pb-20">
        <div className="max-w-4xl mx-auto">
          {!ready ? (
            <Spinner />
          ) : !isAdmin ? (
            <NotAuthorized />
          ) : (
            <StudiosConsole />
          )}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" />
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="glass rounded-3xl p-8 text-center">
      <h1 className="text-xl font-extrabold mb-2">Admins only</h1>
      <p className="text-sm text-gray-400">
        This page is reserved for the BuildEx team.
      </p>
      <Link
        href="/builders"
        className="inline-block mt-5 px-4 py-2 rounded-full text-xs font-semibold border border-[#4ade80]/30 text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80] hover:text-black transition-all"
      >
        Browse builders
      </Link>
    </div>
  );
}
