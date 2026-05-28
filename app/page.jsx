"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { navItems } from "./home/data";
import { smoothScrollTo, showSoon } from "./home/utils";
import Navbar from "./home/components/Navbar";
import MobileMenu from "./home/components/MobileMenu";
import HeroSection from "./home/components/HeroSection";
import ProjectsSection from "./home/components/ProjectsSection";
import HowItWorksSection from "./home/components/HowItWorksSection";
import WhyBuildExSection from "./home/components/WhyBuildExSection";
import SiteFooter from "./home/components/SiteFooter";

export default function BuildExPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const gradientRef = useRef(null);
  const edgeGlowRef = useRef(null);
  const heroVisualRef = useRef(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    setTheme(savedTheme === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!theme) return;

    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.getAttribute("id") || "");
          }
        });
      },
      { threshold: 0.4 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const revealElements = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("active");
        });
      },
      { threshold: 0.15 }
    );

    revealElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function animateValue(el, start, end, duration) {
      let startTimestamp = null;

      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const val = Math.floor(progress * (end - start) + start);
        const suffix = el.dataset.suffix || "";

        if (end >= 1000 && suffix === "+") {
          el.textContent =
            (val / 1000).toFixed(1).replace(/\.0$/, "") + "k";
        } else {
          el.textContent = val + suffix;
        }

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else if (end >= 1000 && suffix === "+") {
          el.textContent =
            (end / 1000).toFixed(1).replace(/\.0$/, "") + "k+";
        } else {
          el.textContent = end + suffix;
        }
      };

      window.requestAnimationFrame(step);
    }

    const counters = document.querySelectorAll(".stat-counter");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.querySelectorAll(".count-up").forEach((counter) => {
            animateValue(counter, 0, parseFloat(counter.dataset.count), 2000);
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((counter) => observer.observe(counter));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const gradientBg = gradientRef.current;
    const edgeGlow = edgeGlowRef.current;
    if (!gradientBg || !edgeGlow) return undefined;

    const config = {
      edgeOffset: 12,
      speedMultiplier: 1,
      smoothing: 0.08,
      idleDrift: 0.00003,
      swayAmplitude: 0.015,
      swaySpeed: 0.0004
    };

    let currentProgress1 = 0;
    let currentProgress2 = 0.5;
    let targetProgress1 = 0;
    let targetProgress2 = 0.5;
    let lastScrollY = window.pageYOffset;
    let animationFrame = 0;

    function perimeterToPosition(progress, offset) {
      const totalProgress = ((progress % 1) + 1) % 1;
      const segment = totalProgress * 4;
      const sideIndex = Math.floor(segment);
      const sideProgress = segment - sideIndex;

      switch (sideIndex) {
        case 0:
          return {
            x: offset + sideProgress * (100 - offset * 2),
            y: offset
          };
        case 1:
          return {
            x: 100 - offset,
            y: offset + sideProgress * (100 - offset * 2)
          };
        case 2:
          return {
            x: 100 - offset - sideProgress * (100 - offset * 2),
            y: 100 - offset
          };
        case 3:
          return {
            x: offset,
            y: 100 - offset - sideProgress * (100 - offset * 2)
          };
        default:
          return { x: offset, y: offset };
      }
    }

    function updateGradientPosition(timestamp) {
      const time = timestamp || performance.now();
      const currentScrollY = window.pageYOffset;
      const scrollDelta = currentScrollY - lastScrollY;

      if (Math.abs(scrollDelta) > 0) {
        targetProgress1 += scrollDelta * 0.0008 * config.speedMultiplier;
        targetProgress2 -= scrollDelta * 0.0006 * config.speedMultiplier;
      }

      targetProgress1 += config.idleDrift;
      targetProgress2 -= config.idleDrift * 0.7;
      lastScrollY = currentScrollY;
      targetProgress1 = ((targetProgress1 % 1) + 1) % 1;
      targetProgress2 = ((targetProgress2 % 1) + 1) % 1;

      let diff1 = targetProgress1 - currentProgress1;
      if (diff1 > 0.5) diff1 -= 1;
      if (diff1 < -0.5) diff1 += 1;

      let diff2 = targetProgress2 - currentProgress2;
      if (diff2 > 0.5) diff2 -= 1;
      if (diff2 < -0.5) diff2 += 1;

      currentProgress1 += diff1 * config.smoothing;
      currentProgress2 += diff2 * config.smoothing;

      const sway1 = Math.sin(time * config.swaySpeed) * config.swayAmplitude;
      const sway2 =
        Math.cos(time * config.swaySpeed * 1.3) *
        config.swayAmplitude *
        0.8;
      const pos1 = perimeterToPosition(currentProgress1 + sway1, config.edgeOffset);
      const pos2 = perimeterToPosition(
        currentProgress2 + sway2,
        config.edgeOffset + 3
      );

      gradientBg.style.setProperty("--gradient-x", `${pos1.x}%`);
      gradientBg.style.setProperty("--gradient-y", `${pos1.y}%`);
      gradientBg.style.setProperty("--gradient-x2", `${pos2.x}%`);
      gradientBg.style.setProperty("--gradient-y2", `${pos2.y}%`);

      const breathe = 1 + Math.sin(time * 0.0003) * 0.12;
      edgeGlow.style.opacity = `${0.45 + breathe * 0.2}`;
      animationFrame = requestAnimationFrame(updateGradientPosition);
    }

    animationFrame = requestAnimationFrame(updateGradientPosition);
    window.gradientAPI = {
      setSpeed: (val) => {
        config.speedMultiplier = val;
      },
      setSmoothing: (val) => {
        config.smoothing = val;
      },
      setSway: (val) => {
        config.swayAmplitude = val * 0.01;
      },
      setEdgeOffset: (val) => {
        config.edgeOffset = val;
      },
      getPositions: () => {
        const pos1 = perimeterToPosition(currentProgress1, config.edgeOffset);
        const pos2 = perimeterToPosition(
          currentProgress2,
          config.edgeOffset + 3
        );

        return {
          main: { x: pos1.x.toFixed(1), y: pos1.y.toFixed(1) },
          second: { x: pos2.x.toFixed(1), y: pos2.y.toFixed(1) }
        };
      }
    };

    return () => {
      cancelAnimationFrame(animationFrame);
      delete window.gradientAPI;
    };
  }, []);

  useEffect(() => {
    const heroVisual = heroVisualRef.current;
    if (!heroVisual) return undefined;

    const revealTimer = window.setTimeout(() => {
      heroVisual.classList.add("visible");
    }, 100);

    function checkWindowHeight() {
      heroVisual.classList.toggle(
        "hide-floating-cards",
        window.innerHeight < 1024
      );
    }

    window.addEventListener("resize", checkWindowHeight);
    checkWindowHeight();

    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener("resize", checkWindowHeight);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    function closeOnDesktopResize() {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktopResize);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktopResize);
    };
  }, []);

  function handleAnchorClick(event, href) {
    event.preventDefault();
    setMobileMenuOpen(false);

    // Route paths (e.g. "/builders") — real client-side navigation
    if (href && href.startsWith("/")) {
      router.push(href);
      return;
    }

    // Hash anchors (e.g. "#projects") — smooth scroll
    if (href && href !== "#") {
      smoothScrollTo(href);
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isLight = theme === "light";

  return (
    <>
      <div ref={gradientRef} className="gradient-background" aria-hidden="true" />
      <div ref={edgeGlowRef} className="gradient-edge-glow" aria-hidden="true" />
      <Navbar
        navItems={navItems}
        activeSection={activeSection}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        isLight={isLight}
        setTheme={setTheme}
        onAnchorClick={handleAnchorClick}
      />
      <MobileMenu
        navItems={navItems}
        activeSection={activeSection}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onAnchorClick={handleAnchorClick}
      />

      <main>
        <HeroSection
          heroVisualRef={heroVisualRef}
          onAnchorClick={handleAnchorClick}
          onShowSoon={showSoon}
        />
        <ProjectsSection onAnchorClick={handleAnchorClick} />
        <HowItWorksSection />
        <WhyBuildExSection />
      </main>
      <SiteFooter />
    </>
  );
}
