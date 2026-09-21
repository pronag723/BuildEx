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
        {/* One link, not two. This used to be a `hidden lg:block` wrapper plus a
            separate `lg:hidden` copy below, because a flex-child <a> ignores its
            own `hidden` utility — wrapping it in a plain div fixes that without
            needing a second element. */}
        <div className="flex flex-col gap-3 mb-10 max-w-7xl mx-auto sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-4xl font-semibold">
            The kind of thing <span className="text-[#4ade80]">people build</span>
          </h2>
          <div className="shrink-0">
            <a
              href={withBase("/")}
              className="text-[#4ade80] hover:underline text-sm inline-flex items-center gap-2"
              onClick={(event) => onAnchorClick(event, "/")}
            >
              View all builders →
            </a>
          </div>
        </div>

        {/* min-h-[500px] used to sit here; at phone widths the cards are only
            ~250px tall, so it left half a screen of dead space. */}
        <div className="overflow-hidden flex items-center fade-edges">
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
