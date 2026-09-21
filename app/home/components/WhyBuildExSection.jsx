"use client";

import { withBase } from "../utils";
import { Icon } from "../../../lib/icons";

// The testimonials that used to live here were invented, and a page being
// rewritten to stop making claims we cannot back is no place for invented
// endorsements. What replaced them is the plainest thing we can put on the
// page: the two lists below, which say exactly what this site does and does
// not do. They match app/legal/documents.js word for word in substance.

const DOES = [
  "Lists Minecraft builders who chose to publish a profile here.",
  "Shows you their portfolio, their styles and the contact links they published.",
  "Gives you somewhere to message them, and somewhere to report abuse.",
];

const DOES_NOT = [
  "Take, hold, escrow or refund money. No payment ever passes through BuildEx.",
  "Vet, verify, endorse, rank or guarantee any builder or any piece of work.",
  "Join in, mediate or take responsibility for any deal you make with a builder.",
];

function ClaimList({ tone, title, items }) {
  const isPositive = tone === "positive";
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-2.5 mb-5">
        <Icon
          name={isPositive ? "check" : "close"}
          size={18}
          strokeWidth={2.2}
          className={`flex-shrink-0 ${
            isPositive ? "text-[#4ade80]" : "text-gray-500"
          }`}
        />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5 text-sm text-gray-400 leading-relaxed"
          >
            <span
              className={`mt-[7px] h-1 w-1 flex-shrink-0 rounded-full ${
                isPositive ? "bg-[#4ade80]" : "bg-gray-600"
              }`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhyBuildExSection({ onAnchorClick }) {
  return (
    <section id="why-buildex" className="py-24 reveal">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-4xl font-semibold text-center mb-10">
          {/* The space after </span> is written as an explicit {" "} because the
              JSX transform drops a plain leading space on a text segment that
              also contains an HTML entity — this heading rendered as
              "BuildExis — and isn't" for as long as the &apos; has been here. */}
          What Build<span className="text-[#4ade80]">Ex</span>{" "}
          is — and isn&apos;t
        </h2>

        {/* One panel split by a shared divider, rather than two separate cards.
            The old version was two `glass rounded-3xl p-8` boxes in a grid that
            CSS had forced to three columns, leaving a phantom empty column on
            every desktop screen. */}
        <div className="glass rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07]">
          <ClaimList tone="positive" title="What BuildEx does" items={DOES} />
          <ClaimList
            tone="negative"
            title="What BuildEx does not do"
            items={DOES_NOT}
          />
        </div>

        <div className="mt-10 text-center">
          <a
            href={withBase("/")}
            onClick={(event) => onAnchorClick?.(event, "/")}
            className="inline-block px-8 py-4 bg-[#4ade80] text-black font-semibold rounded-full hover:scale-105 transition-all green-glow"
          >
            Browse Builders
          </a>
        </div>
      </div>
    </section>
  );
}
