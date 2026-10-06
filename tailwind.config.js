/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (RGB channels) defined on :root and .light in
// app/globals.css, so one class works in both themes: `text-ink-2` is a soft
// grey on the dark canvas and slate on the light one, and `border-line/10` is a
// white hairline in dark mode and a slate one in light. This replaced a few
// dozen `.light .catalog-root .text-white {…}` remaps that existed only to undo
// dark-first utility classes.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  // lib/ is scanned too: lib/ui and lib/i18n render markup, and classes that
  // only appeared there used to be silently dropped from the build.
  content: ["./app/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The smallest phones (320–420px) carry two builder cards per row and a
      // profile header with three controls on one line, so there is real work
      // to do below Tailwind's 640px `sm`. `xs` is an addition, not a
      // replacement: every default breakpoint is untouched.
      screens: {
        xs: "420px"
      },
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        raised: token("raised"),
        ink: {
          DEFAULT: token("ink"),
          2: token("ink-2"),
          3: token("ink-3")
        },
        line: token("line"),
        danger: token("danger"),
        warn: token("warn"),
        accent: {
          DEFAULT: token("accent"),
          // Accent used as text. Identical to the fill on dark; a darker green
          // on light, where #4ade80 text on an off-white page is unreadable.
          ink: token("accent-ink"),
          // Text and icons sitting on an accent fill.
          fg: token("on-accent")
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // The wordmark face. Also used, sparingly, for numerals that want a
        // little block-game geometry — never for body or UI text.
        mark: ["Chakra Petch", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)"
      }
    }
  },
  plugins: []
};
