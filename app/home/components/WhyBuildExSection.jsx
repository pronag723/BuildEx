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

function ClaimList({ tone, icon, title, items }) {
  const isPositive = tone === "positive";
  return (
    <div className="glass rounded-3xl p-8 reveal card-hover">
      <div className="flex items-center gap-3 mb-6">
        <span
          className={`icon-tile flex-shrink-0 ${
            isPositive ? "text-[#4ade80]" : "text-gray-400"
          }`}
        >
          <Icon name={icon} size={20} strokeWidth={1.6} />
        </span>
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-gray-300 leading-relaxed">
            <Icon
              name={isPositive ? "check" : "close"}
              size={17}
              className={`mt-1 flex-shrink-0 ${
                isPositive ? "text-[#4ade80]" : "text-gray-500"
              }`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhyBuildExSection() {
  return (
    <section id="why-buildex" className="py-24 reveal">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-semibold mb-4">
            What Build<span className="text-[#4ade80]">Ex</span> is — and isn&apos;t
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Worth knowing before you message anyone, so there are no surprises
            later.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ClaimList
            tone="positive"
            icon="check"
            title="What BuildEx does"
            items={DOES}
          />
          <ClaimList
            tone="negative"
            icon="close"
            title="What BuildEx does not do"
            items={DOES_NOT}
          />
        </div>

        <div className="mt-10 glass rounded-3xl p-8 text-center reveal">
          <p className="text-gray-300 leading-relaxed max-w-2xl mx-auto">
            So look at the work, ask your questions, agree the scope and the
            price in writing with the builder, and use a payment method you both
            trust. If something goes wrong in a chat here you can report it — but
            the deal itself is yours.
          </p>
          <a
            href={withBase("/builders")}
            className="inline-block mt-7 px-8 py-4 bg-[#4ade80] text-black font-semibold rounded-full hover:scale-105 transition-all green-glow"
          >
            Browse Builders
          </a>
        </div>
      </div>
    </section>
  );
}
