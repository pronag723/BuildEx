"use client";

import Link from "next/link";
import { projects } from "../data";
import { publicAsset } from "../utils";
import { Icon } from "../../../lib/icons";
import { useT } from "../../../lib/i18n/LanguageProvider";

// Tile spans for the gallery, in order. On a phone (two columns) the first
// build spans the full width and two rows, then pairs follow and the last two
// run full-width; from `lg` (four columns) it is a 2×2 feature tile beside four
// small ones, with two wide tiles underneath.
const SPANS = [
  "col-span-2 row-span-2",
  "",
  "",
  "",
  "",
  "col-span-2",
  "col-span-2",
];

export default function ProjectsSection() {
  const t = useT();
  return (
    <section
      id="projects"
      className="mx-auto max-w-7xl scroll-mt-[calc(var(--header-h)+1rem)] px-4 sm:px-6 lg:px-8"
    >
      <div className="border-t border-line/[0.08] py-14 sm:py-20">
        <div className="mb-6 flex flex-col gap-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">
              {t("about.projects.heading")}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-ink-3">{t("about.projects.note")}</p>
          </div>
          <Link
            href="/"
            className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {t("about.projects.viewAll")}
            <Icon name="arrowRight" size={15} />
          </Link>
        </div>

        <div className="grid auto-rows-[8.5rem] grid-cols-2 gap-2 sm:auto-rows-[11rem] sm:gap-3 lg:grid-cols-4 lg:auto-rows-[12rem]">
          {projects.map((project, i) => (
            <figure
              key={project.key}
              className={`relative overflow-hidden rounded-xl bg-raised ${SPANS[i] || ""}`}
            >
              <img
                src={publicAsset(project.image)}
                alt={t(`about.projects.items.${project.key}.alt`)}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <figcaption className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {t(`about.projects.items.${project.key}.title`)}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
