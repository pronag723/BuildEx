"use client";

import { DIRECTORY_DISCLAIMER, steps } from "../data";
import { Icon } from "../../../lib/icons";

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 reveal">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-semibold mb-4">
            How Build<span className="text-[#4ade80]">Ex</span> Works
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Browse the profiles, look at the work, message the builder. Everything
            after the introduction is between the two of you.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 relative">
          {steps.map((step) => (
            <div
              key={step.title}
              className={`glass rounded-3xl p-8 text-center group how-step reveal card-hover ${
                step.className || ""
              }`}
            >
              <div className="icon-tile icon-tile-lg mx-auto mb-6 text-[#4ade80] group-hover:scale-105 transition-transform">
                <Icon name={step.icon} size={32} strokeWidth={1.5} />
              </div>
              <div className="text-2xl font-semibold mb-3">{step.title}</div>
              <p className="text-gray-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
          <div className="hidden lg:block absolute top-1/2 left-1/3 right-1/3 h-px bg-gradient-to-r from-transparent via-[#4ade80]/30 to-transparent" />
        </div>

        {/* Repeated verbatim from the hero. Someone who scrolled straight to the
            steps still has to pass it before they reach a builder. */}
        <div className="mt-12 mx-auto max-w-3xl glass rounded-3xl px-6 py-5 flex items-start gap-4 reveal">
          <span className="icon-tile text-[#4ade80] flex-shrink-0">
            <Icon name="info" size={20} strokeWidth={1.6} />
          </span>
          <p className="text-sm leading-relaxed text-gray-400">
            {DIRECTORY_DISCLAIMER}
          </p>
        </div>
      </div>
    </section>
  );
}
