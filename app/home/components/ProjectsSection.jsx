"use client";

import { projects } from "../data";
import { publicAsset, withBase } from "../utils";

function ProjectCard({ project }) {
  return (
    <div className="glass w-80 rounded-3xl overflow-hidden flex-shrink-0 group project-card card-hover">
      <div className="h-52 bg-zinc-800 relative overflow-hidden">
        <img
          src={publicAsset(project.image)}
          alt={project.alt}
          className="w-full h-full object-cover minecraft-img"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="p-6">
        <div className="font-medium">{project.title}</div>
      </div>
    </div>
  );
}

function ProjectSet({ setIndex }) {
  return (
    <div className="inline-flex gap-6">
      {projects.map((project) => (
        <ProjectCard key={`${setIndex}-${project.image}`} project={project} />
      ))}
    </div>
  );
}

export default function ProjectsSection({ onAnchorClick }) {
  return (
    <section id="projects" className="py-32 reveal">
      <div className="w-full px-6">
        <div className="flex items-center justify-between mb-10 max-w-7xl mx-auto">
          <h2 className="text-4xl font-semibold">
            Top <span className="text-[#4ade80]">Builder&apos;s</span> Projects
          </h2>
          <a
            href={withBase("/builders")}
            className="hidden lg:flex text-[#4ade80] hover:underline text-sm items-center gap-2"
            onClick={(event) => onAnchorClick(event, "/builders")}
          >
            View all builders →
          </a>
        </div>

        <div className="mobile-view-all-wrapper text-center mb-6 lg:hidden">
          <a
            href={withBase("/builders")}
            className="inline-flex text-[#4ade80] hover:underline text-sm items-center gap-2"
            onClick={(event) => onAnchorClick(event, "/builders")}
          >
            View all builders →
          </a>
        </div>

        <div className="overflow-hidden min-h-[500px] flex items-center fade-edges">
          <div
            className="flex gap-6 project-scroll whitespace-nowrap w-max"
            onMouseDown={(event) => event.preventDefault()}
          >
            {[0, 1, 2].map((setIndex) => (
              <ProjectSet key={setIndex} setIndex={setIndex} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
