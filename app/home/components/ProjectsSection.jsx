"use client";

import { projects } from "../data";
import { publicAsset } from "../utils";

function ProjectCard({ project }) {
  return (
    <div className="glass w-80 rounded-3xl overflow-hidden flex-shrink-0 group project-card card-hover">
      <div className="h-52 bg-zinc-800 relative overflow-hidden">
        <img
          src={publicAsset(project.image)}
          alt={project.alt}
          className="w-full h-full object-cover minecraft-img"
        />
        {project.rank ? (
          <div className="absolute top-4 right-4 glass px-3 py-1 text-xs rounded-full">
            {project.rank}
          </div>
        ) : null}
      </div>
      <div className="p-6">
        <div className="font-medium">{project.title}</div>
        <div className="text-sm text-gray-400">
          by {project.builder} • {project.rating} ★
        </div>
        <div className="mt-4 flex justify-between items-center">
          <div className="text-[#4ade80] font-semibold">{project.price}</div>
          <div className="text-xs bg-white/10 px-4 py-1 rounded-full">Completed</div>
        </div>
      </div>
    </div>
  );
}

function ProjectSet({ setIndex }) {
  return (
    <div className="inline-flex gap-6">
      {projects.map((project) => (
        <ProjectCard key={`${setIndex}-${project.title}`} project={project} />
      ))}
    </div>
  );
}

export default function ProjectsSection({ projectScrollRef, onAnchorClick }) {
  return (
    <section id="projects" className="py-32 reveal">
      <div className="w-full px-6">
        <div className="flex items-end justify-between mb-10 max-w-7xl mx-auto">
          <h2 className="text-4xl font-semibold">
            Top <span className="text-[#4ade80]">Builder&apos;s</span> Projects
          </h2>
          <a
            href="#projects"
            className="text-[#4ade80] hover:underline text-sm flex items-center gap-2"
            onClick={(event) => onAnchorClick(event, "#projects")}
          >
            View all projects →
          </a>
        </div>

        <div className="mobile-view-all-wrapper text-center mb-6 lg:hidden">
          <a
            href="#projects"
            className="inline-flex text-[#4ade80] hover:underline text-sm items-center gap-2"
            onClick={(event) => onAnchorClick(event, "#projects")}
          >
            View all projects →
          </a>
        </div>

        <div className="overflow-hidden min-h-[500px] flex items-center fade-edges">
          <div
            ref={projectScrollRef}
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
