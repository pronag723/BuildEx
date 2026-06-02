"use client";

import { testimonials } from "../data";

export default function WhyBuildExSection() {
  return (
    <section id="why-buildex" className="py-24 reveal">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-semibold mb-4">
            Why Builders &amp; Server Owners Choose BuildEx
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Real experiences from our community. See why BuildEx is the most
            trusted marketplace for Minecraft builds.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="glass rounded-3xl p-8 testimonial-card reveal card-hover"
            >
              <div className="flex items-center gap-4 mb-6">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-14 h-14 rounded-2xl object-cover"
                  loading="lazy"
                  decoding="async"
                />
                <div>
                  <div className="font-semibold text-lg">{testimonial.name}</div>
                  <div className="text-sm text-gray-400">{testimonial.role}</div>
                </div>
              </div>
              <p className="text-gray-300 leading-relaxed">{testimonial.body}</p>
              <div className="mt-6 flex items-center gap-1 text-[#4ade80]">★★★★★</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
