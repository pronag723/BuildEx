"use client";

import { steps } from "../data";
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
            Browse the builder feed, hire the right creator directly, and pay
            only the build price - simple, secure, and built for Minecraft.
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
      </div>
    </section>
  );
}
